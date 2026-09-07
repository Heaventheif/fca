export function createSearchMessageCommand({ defaultFuncs, ctx, logError }) {
  return async function searchMessage(threadID, searchText, limit = 20) {
    if (!threadID) throw new Error('searchMessage: threadID مطلوب');
    if (!searchText) throw new Error('searchMessage: searchText مطلوب');

    const form = {
      av: ctx.userID,
      __user: ctx.userID,
      __a: 1,
      __req: defaultFuncs?.getReqCounter?.() ?? '0',
      fb_dtsg: ctx.fb_dtsg ?? '',
      variables: JSON.stringify({
        thread_id: threadID,
        search_text: searchText,
        limit,
      }),
      doc_id: '1508526735892416', 
    };

    return new Promise((resolve, reject) => {
      if (!defaultFuncs?.postFormData) {
        reject(new Error('searchMessage: defaultFuncs.postFormData غير متاح'));
        return;
      }

      defaultFuncs.postFormData(
        'https://www.facebook.com/api/graphql/',
        ctx,
        form,
        (err, resData) => {
          if (err) {
            if (logError) logError('searchMessage', err);
            return reject(err);
          }

          
          try {
            const data = resData?.data?.message_search?.edges ?? [];
            const messages = data.map((edge) => {
              const node = edge.node ?? {};
              return {
                messageID: node.message_id ?? node.messageId ?? '',
                threadID,
                senderID: String(node.message_sender?.id ?? ''),
                body: node.snippet ?? node.message?.text ?? '',
                timestamp: node.timestamp_precise ?? node.timestamp ?? 0,
              };
            });
            resolve(messages);
          } catch (parseErr) {
            reject(parseErr);
          }
        }
      );
    });
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-search-message',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/search-message.js' },
  setup(_ctx) {
    // provides: createSearchMessageCommand
  },
};
