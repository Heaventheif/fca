import { getSignatureID } from '../../../lib/utils/format/index.js';
import { parseAndCheckLogin } from '../../../lib/utils/client.js';

export default function suggestFriendFactory(http, ctx) {
  return async function suggestFriend(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const count = options.count ?? 10;

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
      fb_api_req_friendly_name: 'FriendingCometPeopleYouMayKnowImpressionMutation',
      variables: JSON.stringify({
        count,
        scale: 1,
        id: ctx.userID,
      }),
      server_timestamps: true,
      doc_id: '7026429040799048',
    };

    try {
      const res = await http
        .post('https://www.facebook.com/api/graphql/', ctx.jar, params)
        .then(parseAndCheckLogin(ctx, http));

      if (res?.error) throw res;

      const edges = res?.data?.viewer?.pymk_context?.people_you_may_know?.edges ?? [];
      const people = edges
        .map((e) => ({
          userID: e?.node?.id,
          name: e?.node?.name,
          profilePicture: e?.node?.profile_picture?.uri ?? null,
          mutualFriends: e?.node?.mutual_friend_count ?? 0,
        }))
        .filter((p) => p.userID);

      if (typeof callback === 'function') return callback(null, people);
      return people;
    } catch (e) {
      if (typeof callback === 'function') return callback(e);
      throw e;
    }
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-users-suggest-friend',
  meta: { category: 'external-api-users', path: 'lib/external-apis/users/suggestFriend.js' },
  setup(_ctx) {
    // provides: suggestFriendFactory
  },
};
