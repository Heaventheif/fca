import { getSignatureID } from '../../../lib/utils/format/index.js';
import { parseAndCheckLogin } from '../../../lib/utils/client.js';

export default function acpUserFactory(http, api, ctx) {
  return async function acpUser(userID, callback) {
    if (!userID) throw new Error('acpUser: userID is required');

    const params = {
      av: ctx.userID,
      __aaid: 0,
      __user: ctx.userID,
      __a: 1,
      __req: getSignatureID(),
      dpr: 1,
      __ccg: 'EXCELLENT',
      __rev: ctx.req_ID || '1027405870',
      __hsi: ctx.hsi || '',
      __comet_req: 15,
      fb_dtsg: ctx.fb_dtsg,
      jazoest: ctx.ttstamp,
      lsd: ctx.fb_dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'FriendingCometFriendRequestConfirmMutation',
      variables: JSON.stringify({
        input: {
          source: 'friends_tab',
          friend_requester_id: String(userID),
          actor_id: ctx.userID,
          client_mutation_id: String(Math.floor(Math.random() * 1e9)),
        },
      }),
      server_timestamps: true,
      doc_id: '6003738476371496',
    };

    try {
      const res = await http
        .post('https://www.facebook.com/api/graphql/', ctx.jar, params)
        .then(parseAndCheckLogin(ctx, http));

      if (res?.error) throw res;

      const result = {
        userID,
        ok: true,
        friendshipStatus:
          res?.data?.friend_request_confirm?.friend_requesters?.[0]?.friendship_status ??
          'ARE_FRIENDS',
        timestamp: Date.now(),
      };

      if (typeof callback === 'function') return callback(null, result);
      return result;
    } catch (e) {
      if (typeof callback === 'function') return callback(e);
      throw e;
    }
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-action-acp-user',
  meta: { category: 'external-api-action', path: 'lib/external-apis/action/acpUser.js' },
  setup(_ctx) {
    // provides: acpUserFactory
  },
};
