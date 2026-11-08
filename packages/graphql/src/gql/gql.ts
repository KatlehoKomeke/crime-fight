/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation DeleteAccount($handle: String!) {\n    deleteAccount(handle: $handle)\n  }\n": typeof types.DeleteAccountDocument,
    "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n    bounty {\n      id\n      amountCents\n      status\n      kind\n      expiresAt\n    }\n  }\n": typeof types.PostCardFieldsFragmentDoc,
    "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n": typeof types.UserRowFieldsFragmentDoc,
    "\n  query Feed($kind: FeedKind!, $first: Int!, $after: String) {\n    feed(kind: $kind, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.FeedDocument,
    "\n  query Notifications($first: Int!, $after: String) {\n    notifications(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          id\n          kind\n          createdAt\n          actor {\n            id\n            handle\n            displayName\n            initials\n            avatarUrl\n            verified\n            role\n          }\n          post {\n            ...PostCardFields\n          }\n          bountyEvent\n          note\n          bounty {\n            id\n            title\n            amountCents\n            status\n            kind\n            viewerIsPoster\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.NotificationsDocument,
    "\n  query LatestNotification {\n    latestNotificationAt\n  }\n": typeof types.LatestNotificationDocument,
    "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.PostDocument,
    "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      bountyCount\n      viewerCanMessage\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.ProfileDocument,
    "\n  fragment PreviewImageFields on PreviewImage {\n    path\n    alt\n  }\n": typeof types.PreviewImageFieldsFragmentDoc,
    "\n  query ProfileMetadata($handle: String!) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      bio\n      trustBadge\n      postCount\n      followerCount\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": typeof types.ProfileMetadataDocument,
    "\n  query PostMetadata($id: ID!) {\n    post(id: $id) {\n      id\n      body\n      kind\n      severity\n      area\n      category\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n      topics {\n        id\n        title\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": typeof types.PostMetadataDocument,
    "\n  query TopicMetadata($slug: String!) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": typeof types.TopicMetadataDocument,
    "\n  query Followers($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      followers(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.FollowersDocument,
    "\n  query Following($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      following(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.FollowingDocument,
    "\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.TopicDocument,
    "\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.SearchDocument,
    "\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.SavedDocument,
    "\n  query Shell {\n    paymentsStatus\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n": typeof types.ShellDocument,
    "\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n": typeof types.TrendsDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": typeof types.ViewerDocument,
    "\n  query Settings {\n    viewer {\n      id\n      handle\n      displayName\n      bio\n      email\n      initials\n      avatarUrl\n    }\n  }\n": typeof types.SettingsDocument,
    "\n  mutation UpdateProfile($input: UpdateProfileInput!) {\n    updateProfile(input: $input) {\n      id\n      displayName\n      bio\n      initials\n    }\n  }\n": typeof types.UpdateProfileDocument,
    "\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": typeof types.LikePostDocument,
    "\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": typeof types.UnlikePostDocument,
    "\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": typeof types.RepostPostDocument,
    "\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": typeof types.UnrepostPostDocument,
    "\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": typeof types.SavePostDocument,
    "\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": typeof types.UnsavePostDocument,
    "\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n": typeof types.CreatePostDocument,
    "\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n": typeof types.DeletePostDocument,
    "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n": typeof types.FollowUserDocument,
    "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n": typeof types.UnfollowUserDocument,
    "\n  fragment MessageFields on Message {\n    id\n    body\n    createdAt\n    isMine\n    sender {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n    }\n  }\n": typeof types.MessageFieldsFragmentDoc,
    "\n  fragment ConversationRowFields on Conversation {\n    id\n    lastMessageAt\n    unreadCount\n    viewerCanSend\n    lastMessage {\n      id\n      body\n      createdAt\n      isMine\n    }\n    members {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": typeof types.ConversationRowFieldsFragmentDoc,
    "\n  fragment InboxEventFields on InboxEvent {\n    conversation {\n      ...ConversationRowFields\n    }\n    messageEdge {\n      cursor\n      node {\n        ...MessageFields\n      }\n    }\n    viewer {\n      id\n      unreadConversationCount\n    }\n  }\n": typeof types.InboxEventFieldsFragmentDoc,
    "\n  subscription Inbox {\n    inbox {\n      ...InboxEventFields\n    }\n  }\n": typeof types.InboxDocument,
    "\n  query InboxState {\n    viewer {\n      id\n      inboxChannel\n      unreadConversationCount\n    }\n  }\n": typeof types.InboxStateDocument,
    "\n  query Conversations($first: Int!, $after: String) {\n    conversations(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ConversationRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.ConversationsDocument,
    "\n  query Conversation($id: ID!, $first: Int!, $after: String) {\n    conversation(id: $id) {\n      ...ConversationRowFields\n      messages(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...MessageFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.ConversationDocument,
    "\n  query MessageContacts($query: String) {\n    messageContacts(query: $query, first: 30) {\n      ...UserRowFields\n    }\n  }\n": typeof types.MessageContactsDocument,
    "\n  mutation StartConversation($userId: ID!) {\n    startConversation(userId: $userId) {\n      ...ConversationRowFields\n    }\n  }\n": typeof types.StartConversationDocument,
    "\n  mutation SendMessage($conversationId: ID!, $body: String!) {\n    sendMessage(conversationId: $conversationId, body: $body) {\n      ...InboxEventFields\n    }\n  }\n": typeof types.SendMessageDocument,
    "\n  mutation MarkConversationRead($id: ID!) {\n    markConversationRead(id: $id) {\n      ...InboxEventFields\n    }\n  }\n": typeof types.MarkConversationReadDocument,
    "\n  fragment BountyRowFields on Bounty {\n    id\n    kind\n    status\n    title\n    area\n    amountCents\n    createdAt\n    fundedAt\n    expiresAt\n    closedAt\n    isExpired\n    claimCount\n    viewerIsPoster\n    poster {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": typeof types.BountyRowFieldsFragmentDoc,
    "\n  fragment ClaimFields on BountyClaim {\n    id\n    status\n    body\n    links\n    posterNote\n    confirmNote\n    disputeNote\n    decisionReason\n    decisionNote\n    createdAt\n    approvedAt\n    posterAnswerDue\n    confirmedAt\n    cooldownUntil\n    decidedAt\n    viewerIsClaimant\n    claimant {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n      createdAt\n    }\n  }\n": typeof types.ClaimFieldsFragmentDoc,
    "\n  fragment PayoutAccountFields on PayoutAccount {\n    id\n    bankName\n    bankCode\n    accountName\n    accountLast4\n    status\n    createdAt\n    readyAt\n  }\n": typeof types.PayoutAccountFieldsFragmentDoc,
    "\n  fragment BountyDetailFields on Bounty {\n    ...BountyRowFields\n    body\n    currency\n    durationDays\n    sapsCaseNumber\n    relationship\n    frozenFromStatus\n    removedAt\n    claimsBeingChecked\n    poster {\n      ...UserRowFields\n      viewerCanMessage\n    }\n    post {\n      id\n      body\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n    }\n    viewerClaim {\n      ...ClaimFields\n    }\n    winningClaim {\n      ...ClaimFields\n    }\n    claims {\n      ...ClaimFields\n      preflight {\n        claimantCreatedAfterBounty\n        claimantHasNoOtherActivity\n        priorPairings\n        payoutNameMismatch\n        payoutAccountAgeHours\n        cooldownEndsAt\n      }\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n    events {\n      id\n      kind\n      claimId\n      byAdmin\n      note\n      createdAt\n      actor {\n        id\n        handle\n        displayName\n        initials\n        avatarUrl\n        verified\n        role\n      }\n    }\n    reports {\n      reason\n      note\n      createdAt\n      reporter {\n        id\n        handle\n        displayName\n      }\n    }\n    ledger {\n      id\n      type\n      status\n      amountCents\n      provider\n      reference\n      providerRef\n      note\n      createdAt\n      settledAt\n    }\n    latestPayout {\n      id\n      status\n      createdAt\n    }\n  }\n": typeof types.BountyDetailFieldsFragmentDoc,
    "\n  query Bounties($kind: BountyKind, $honoured: Boolean, $first: Int!, $after: String) {\n    bounties(kind: $kind, honoured: $honoured, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.BountiesDocument,
    "\n  query Bounty($id: ID!) {\n    bounty(id: $id) {\n      ...BountyDetailFields\n    }\n  }\n": typeof types.BountyDocument,
    "\n  query BountyMetadata($id: ID!) {\n    bounty(id: $id) {\n      id\n      title\n      kind\n      status\n      amountCents\n      area\n      body\n      createdAt\n      poster {\n        id\n        handle\n        displayName\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": typeof types.BountyMetadataDocument,
    "\n  query MyBounties($first: Int!, $after: String) {\n    myBounties(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          claims {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.MyBountiesDocument,
    "\n  query MyClaims($first: Int!, $after: String) {\n    myClaims(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ClaimFields\n          bounty {\n            ...BountyRowFields\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.MyClaimsDocument,
    "\n  query BountyQueue($first: Int!, $after: String) {\n    bountyQueue(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          frozenFromStatus\n          claims {\n            id\n            status\n            createdAt\n            approvedAt\n            posterAnswerDue\n            confirmedAt\n            cooldownUntil\n            claimant {\n              id\n              handle\n            }\n          }\n          reports {\n            reason\n            createdAt\n          }\n          latestPayout {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.BountyQueueDocument,
    "\n  query ProfileBounties($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      bounties(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...BountyRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.ProfileBountiesDocument,
    "\n  query HonouredBounties {\n    bounties(honoured: true, first: 3) {\n      edges {\n        node {\n          id\n          title\n          amountCents\n          closedAt\n        }\n      }\n    }\n  }\n": typeof types.HonouredBountiesDocument,
    "\n  query PaymentsStatus {\n    paymentsStatus\n  }\n": typeof types.PaymentsStatusDocument,
    "\n  query Banks {\n    banks {\n      name\n      code\n    }\n  }\n": typeof types.BanksDocument,
    "\n  query AdminState {\n    viewer {\n      id\n      viewerIsAdmin\n    }\n  }\n": typeof types.AdminStateDocument,
    "\n  query PayoutSettings {\n    viewer {\n      id\n      displayName\n      heldBountyIds\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n  }\n": typeof types.PayoutSettingsDocument,
    "\n  fragment BountyStateFields on Bounty {\n    id\n    status\n    isExpired\n    claimCount\n    fundedAt\n    expiresAt\n    closedAt\n    frozenFromStatus\n  }\n": typeof types.BountyStateFieldsFragmentDoc,
    "\n  mutation CreateBounty($input: CreateBountyInput!) {\n    createBounty(input: $input) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.CreateBountyDocument,
    "\n  mutation RetryBountyCheckout($id: ID!) {\n    retryBountyCheckout(id: $id) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.RetryBountyCheckoutDocument,
    "\n  mutation ConfirmBountyPayment($id: ID!) {\n    confirmBountyPayment(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.ConfirmBountyPaymentDocument,
    "\n  mutation SandboxCompleteCheckout($id: ID!, $outcome: String) {\n    sandboxCompleteCheckout(id: $id, outcome: $outcome) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.SandboxCompleteCheckoutDocument,
    "\n  mutation CancelBounty($id: ID!) {\n    cancelBounty(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.CancelBountyDocument,
    "\n  mutation RequestBountyCancellation($id: ID!, $note: String!) {\n    requestBountyCancellation(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.RequestBountyCancellationDocument,
    "\n  mutation SubmitClaim($bountyId: ID!, $input: SubmitClaimInput!) {\n    submitClaim(bountyId: $bountyId, input: $input) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.SubmitClaimDocument,
    "\n  mutation WithdrawClaim($id: ID!) {\n    withdrawClaim(id: $id) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.WithdrawClaimDocument,
    "\n  mutation ConfirmClaim($id: ID!, $note: String) {\n    confirmClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.ConfirmClaimDocument,
    "\n  mutation ObjectToClaim($id: ID!, $note: String!) {\n    objectToClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.ObjectToClaimDocument,
    "\n  mutation ReportBounty($id: ID!, $reason: BountyReportReason!, $note: String) {\n    reportBounty(id: $id, reason: $reason, note: $note) {\n      id\n    }\n  }\n": typeof types.ReportBountyDocument,
    "\n  mutation SetPayoutAccount($input: PayoutAccountInput!) {\n    setPayoutAccount(input: $input) {\n      ...PayoutAccountFields\n    }\n  }\n": typeof types.SetPayoutAccountDocument,
    "\n  mutation DecideClaim($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) {\n    decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": typeof types.DecideClaimDocument,
    "\n  mutation RetryBountyPayout($id: ID!) {\n    retryBountyPayout(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.RetryBountyPayoutDocument,
    "\n  mutation ApproveBounty($id: ID!, $note: String!) {\n    approveBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.ApproveBountyDocument,
    "\n  mutation DeclineBounty($id: ID!, $note: String!) {\n    declineBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.DeclineBountyDocument,
    "\n  mutation AdminCancelBounty($id: ID!, $note: String!, $takeDown: Boolean) {\n    adminCancelBounty(id: $id, note: $note, takeDown: $takeDown) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.AdminCancelBountyDocument,
    "\n  mutation RetryBountyRefund($id: ID!) {\n    retryBountyRefund(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.RetryBountyRefundDocument,
    "\n  mutation FreezeBounty($id: ID!, $note: String!) {\n    freezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.FreezeBountyDocument,
    "\n  mutation UnfreezeBounty($id: ID!, $note: String!) {\n    unfreezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": typeof types.UnfreezeBountyDocument,
    "\n  mutation SweepBounties {\n    sweepBounties {\n      abandoned\n      expired\n      expiring\n      escalated\n      redriven\n      scrubbed\n    }\n  }\n": typeof types.SweepBountiesDocument,
};
const documents: Documents = {
    "\n  mutation DeleteAccount($handle: String!) {\n    deleteAccount(handle: $handle)\n  }\n": types.DeleteAccountDocument,
    "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n    bounty {\n      id\n      amountCents\n      status\n      kind\n      expiresAt\n    }\n  }\n": types.PostCardFieldsFragmentDoc,
    "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n": types.UserRowFieldsFragmentDoc,
    "\n  query Feed($kind: FeedKind!, $first: Int!, $after: String) {\n    feed(kind: $kind, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.FeedDocument,
    "\n  query Notifications($first: Int!, $after: String) {\n    notifications(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          id\n          kind\n          createdAt\n          actor {\n            id\n            handle\n            displayName\n            initials\n            avatarUrl\n            verified\n            role\n          }\n          post {\n            ...PostCardFields\n          }\n          bountyEvent\n          note\n          bounty {\n            id\n            title\n            amountCents\n            status\n            kind\n            viewerIsPoster\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.NotificationsDocument,
    "\n  query LatestNotification {\n    latestNotificationAt\n  }\n": types.LatestNotificationDocument,
    "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.PostDocument,
    "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      bountyCount\n      viewerCanMessage\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.ProfileDocument,
    "\n  fragment PreviewImageFields on PreviewImage {\n    path\n    alt\n  }\n": types.PreviewImageFieldsFragmentDoc,
    "\n  query ProfileMetadata($handle: String!) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      bio\n      trustBadge\n      postCount\n      followerCount\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": types.ProfileMetadataDocument,
    "\n  query PostMetadata($id: ID!) {\n    post(id: $id) {\n      id\n      body\n      kind\n      severity\n      area\n      category\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n      topics {\n        id\n        title\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": types.PostMetadataDocument,
    "\n  query TopicMetadata($slug: String!) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": types.TopicMetadataDocument,
    "\n  query Followers($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      followers(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.FollowersDocument,
    "\n  query Following($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      following(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.FollowingDocument,
    "\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.TopicDocument,
    "\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.SearchDocument,
    "\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.SavedDocument,
    "\n  query Shell {\n    paymentsStatus\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n": types.ShellDocument,
    "\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n": types.TrendsDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": types.ViewerDocument,
    "\n  query Settings {\n    viewer {\n      id\n      handle\n      displayName\n      bio\n      email\n      initials\n      avatarUrl\n    }\n  }\n": types.SettingsDocument,
    "\n  mutation UpdateProfile($input: UpdateProfileInput!) {\n    updateProfile(input: $input) {\n      id\n      displayName\n      bio\n      initials\n    }\n  }\n": types.UpdateProfileDocument,
    "\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": types.LikePostDocument,
    "\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": types.UnlikePostDocument,
    "\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": types.RepostPostDocument,
    "\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": types.UnrepostPostDocument,
    "\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": types.SavePostDocument,
    "\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": types.UnsavePostDocument,
    "\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n": types.CreatePostDocument,
    "\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n": types.DeletePostDocument,
    "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n": types.FollowUserDocument,
    "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n": types.UnfollowUserDocument,
    "\n  fragment MessageFields on Message {\n    id\n    body\n    createdAt\n    isMine\n    sender {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n    }\n  }\n": types.MessageFieldsFragmentDoc,
    "\n  fragment ConversationRowFields on Conversation {\n    id\n    lastMessageAt\n    unreadCount\n    viewerCanSend\n    lastMessage {\n      id\n      body\n      createdAt\n      isMine\n    }\n    members {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": types.ConversationRowFieldsFragmentDoc,
    "\n  fragment InboxEventFields on InboxEvent {\n    conversation {\n      ...ConversationRowFields\n    }\n    messageEdge {\n      cursor\n      node {\n        ...MessageFields\n      }\n    }\n    viewer {\n      id\n      unreadConversationCount\n    }\n  }\n": types.InboxEventFieldsFragmentDoc,
    "\n  subscription Inbox {\n    inbox {\n      ...InboxEventFields\n    }\n  }\n": types.InboxDocument,
    "\n  query InboxState {\n    viewer {\n      id\n      inboxChannel\n      unreadConversationCount\n    }\n  }\n": types.InboxStateDocument,
    "\n  query Conversations($first: Int!, $after: String) {\n    conversations(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ConversationRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.ConversationsDocument,
    "\n  query Conversation($id: ID!, $first: Int!, $after: String) {\n    conversation(id: $id) {\n      ...ConversationRowFields\n      messages(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...MessageFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.ConversationDocument,
    "\n  query MessageContacts($query: String) {\n    messageContacts(query: $query, first: 30) {\n      ...UserRowFields\n    }\n  }\n": types.MessageContactsDocument,
    "\n  mutation StartConversation($userId: ID!) {\n    startConversation(userId: $userId) {\n      ...ConversationRowFields\n    }\n  }\n": types.StartConversationDocument,
    "\n  mutation SendMessage($conversationId: ID!, $body: String!) {\n    sendMessage(conversationId: $conversationId, body: $body) {\n      ...InboxEventFields\n    }\n  }\n": types.SendMessageDocument,
    "\n  mutation MarkConversationRead($id: ID!) {\n    markConversationRead(id: $id) {\n      ...InboxEventFields\n    }\n  }\n": types.MarkConversationReadDocument,
    "\n  fragment BountyRowFields on Bounty {\n    id\n    kind\n    status\n    title\n    area\n    amountCents\n    createdAt\n    fundedAt\n    expiresAt\n    closedAt\n    isExpired\n    claimCount\n    viewerIsPoster\n    poster {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": types.BountyRowFieldsFragmentDoc,
    "\n  fragment ClaimFields on BountyClaim {\n    id\n    status\n    body\n    links\n    posterNote\n    confirmNote\n    disputeNote\n    decisionReason\n    decisionNote\n    createdAt\n    approvedAt\n    posterAnswerDue\n    confirmedAt\n    cooldownUntil\n    decidedAt\n    viewerIsClaimant\n    claimant {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n      createdAt\n    }\n  }\n": types.ClaimFieldsFragmentDoc,
    "\n  fragment PayoutAccountFields on PayoutAccount {\n    id\n    bankName\n    bankCode\n    accountName\n    accountLast4\n    status\n    createdAt\n    readyAt\n  }\n": types.PayoutAccountFieldsFragmentDoc,
    "\n  fragment BountyDetailFields on Bounty {\n    ...BountyRowFields\n    body\n    currency\n    durationDays\n    sapsCaseNumber\n    relationship\n    frozenFromStatus\n    removedAt\n    claimsBeingChecked\n    poster {\n      ...UserRowFields\n      viewerCanMessage\n    }\n    post {\n      id\n      body\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n    }\n    viewerClaim {\n      ...ClaimFields\n    }\n    winningClaim {\n      ...ClaimFields\n    }\n    claims {\n      ...ClaimFields\n      preflight {\n        claimantCreatedAfterBounty\n        claimantHasNoOtherActivity\n        priorPairings\n        payoutNameMismatch\n        payoutAccountAgeHours\n        cooldownEndsAt\n      }\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n    events {\n      id\n      kind\n      claimId\n      byAdmin\n      note\n      createdAt\n      actor {\n        id\n        handle\n        displayName\n        initials\n        avatarUrl\n        verified\n        role\n      }\n    }\n    reports {\n      reason\n      note\n      createdAt\n      reporter {\n        id\n        handle\n        displayName\n      }\n    }\n    ledger {\n      id\n      type\n      status\n      amountCents\n      provider\n      reference\n      providerRef\n      note\n      createdAt\n      settledAt\n    }\n    latestPayout {\n      id\n      status\n      createdAt\n    }\n  }\n": types.BountyDetailFieldsFragmentDoc,
    "\n  query Bounties($kind: BountyKind, $honoured: Boolean, $first: Int!, $after: String) {\n    bounties(kind: $kind, honoured: $honoured, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.BountiesDocument,
    "\n  query Bounty($id: ID!) {\n    bounty(id: $id) {\n      ...BountyDetailFields\n    }\n  }\n": types.BountyDocument,
    "\n  query BountyMetadata($id: ID!) {\n    bounty(id: $id) {\n      id\n      title\n      kind\n      status\n      amountCents\n      area\n      body\n      createdAt\n      poster {\n        id\n        handle\n        displayName\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n": types.BountyMetadataDocument,
    "\n  query MyBounties($first: Int!, $after: String) {\n    myBounties(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          claims {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.MyBountiesDocument,
    "\n  query MyClaims($first: Int!, $after: String) {\n    myClaims(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ClaimFields\n          bounty {\n            ...BountyRowFields\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.MyClaimsDocument,
    "\n  query BountyQueue($first: Int!, $after: String) {\n    bountyQueue(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          frozenFromStatus\n          claims {\n            id\n            status\n            createdAt\n            approvedAt\n            posterAnswerDue\n            confirmedAt\n            cooldownUntil\n            claimant {\n              id\n              handle\n            }\n          }\n          reports {\n            reason\n            createdAt\n          }\n          latestPayout {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.BountyQueueDocument,
    "\n  query ProfileBounties($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      bounties(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...BountyRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.ProfileBountiesDocument,
    "\n  query HonouredBounties {\n    bounties(honoured: true, first: 3) {\n      edges {\n        node {\n          id\n          title\n          amountCents\n          closedAt\n        }\n      }\n    }\n  }\n": types.HonouredBountiesDocument,
    "\n  query PaymentsStatus {\n    paymentsStatus\n  }\n": types.PaymentsStatusDocument,
    "\n  query Banks {\n    banks {\n      name\n      code\n    }\n  }\n": types.BanksDocument,
    "\n  query AdminState {\n    viewer {\n      id\n      viewerIsAdmin\n    }\n  }\n": types.AdminStateDocument,
    "\n  query PayoutSettings {\n    viewer {\n      id\n      displayName\n      heldBountyIds\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n  }\n": types.PayoutSettingsDocument,
    "\n  fragment BountyStateFields on Bounty {\n    id\n    status\n    isExpired\n    claimCount\n    fundedAt\n    expiresAt\n    closedAt\n    frozenFromStatus\n  }\n": types.BountyStateFieldsFragmentDoc,
    "\n  mutation CreateBounty($input: CreateBountyInput!) {\n    createBounty(input: $input) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.CreateBountyDocument,
    "\n  mutation RetryBountyCheckout($id: ID!) {\n    retryBountyCheckout(id: $id) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.RetryBountyCheckoutDocument,
    "\n  mutation ConfirmBountyPayment($id: ID!) {\n    confirmBountyPayment(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": types.ConfirmBountyPaymentDocument,
    "\n  mutation SandboxCompleteCheckout($id: ID!, $outcome: String) {\n    sandboxCompleteCheckout(id: $id, outcome: $outcome) {\n      ...BountyStateFields\n    }\n  }\n": types.SandboxCompleteCheckoutDocument,
    "\n  mutation CancelBounty($id: ID!) {\n    cancelBounty(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": types.CancelBountyDocument,
    "\n  mutation RequestBountyCancellation($id: ID!, $note: String!) {\n    requestBountyCancellation(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": types.RequestBountyCancellationDocument,
    "\n  mutation SubmitClaim($bountyId: ID!, $input: SubmitClaimInput!) {\n    submitClaim(bountyId: $bountyId, input: $input) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.SubmitClaimDocument,
    "\n  mutation WithdrawClaim($id: ID!) {\n    withdrawClaim(id: $id) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.WithdrawClaimDocument,
    "\n  mutation ConfirmClaim($id: ID!, $note: String) {\n    confirmClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.ConfirmClaimDocument,
    "\n  mutation ObjectToClaim($id: ID!, $note: String!) {\n    objectToClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.ObjectToClaimDocument,
    "\n  mutation ReportBounty($id: ID!, $reason: BountyReportReason!, $note: String) {\n    reportBounty(id: $id, reason: $reason, note: $note) {\n      id\n    }\n  }\n": types.ReportBountyDocument,
    "\n  mutation SetPayoutAccount($input: PayoutAccountInput!) {\n    setPayoutAccount(input: $input) {\n      ...PayoutAccountFields\n    }\n  }\n": types.SetPayoutAccountDocument,
    "\n  mutation DecideClaim($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) {\n    decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n": types.DecideClaimDocument,
    "\n  mutation RetryBountyPayout($id: ID!) {\n    retryBountyPayout(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": types.RetryBountyPayoutDocument,
    "\n  mutation ApproveBounty($id: ID!, $note: String!) {\n    approveBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": types.ApproveBountyDocument,
    "\n  mutation DeclineBounty($id: ID!, $note: String!) {\n    declineBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": types.DeclineBountyDocument,
    "\n  mutation AdminCancelBounty($id: ID!, $note: String!, $takeDown: Boolean) {\n    adminCancelBounty(id: $id, note: $note, takeDown: $takeDown) {\n      ...BountyStateFields\n    }\n  }\n": types.AdminCancelBountyDocument,
    "\n  mutation RetryBountyRefund($id: ID!) {\n    retryBountyRefund(id: $id) {\n      ...BountyStateFields\n    }\n  }\n": types.RetryBountyRefundDocument,
    "\n  mutation FreezeBounty($id: ID!, $note: String!) {\n    freezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": types.FreezeBountyDocument,
    "\n  mutation UnfreezeBounty($id: ID!, $note: String!) {\n    unfreezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n": types.UnfreezeBountyDocument,
    "\n  mutation SweepBounties {\n    sweepBounties {\n      abandoned\n      expired\n      expiring\n      escalated\n      redriven\n      scrubbed\n    }\n  }\n": types.SweepBountiesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteAccount($handle: String!) {\n    deleteAccount(handle: $handle)\n  }\n"): (typeof documents)["\n  mutation DeleteAccount($handle: String!) {\n    deleteAccount(handle: $handle)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n    bounty {\n      id\n      amountCents\n      status\n      kind\n      expiresAt\n    }\n  }\n"): (typeof documents)["\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n    bounty {\n      id\n      amountCents\n      status\n      kind\n      expiresAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n"): (typeof documents)["\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Feed($kind: FeedKind!, $first: Int!, $after: String) {\n    feed(kind: $kind, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Feed($kind: FeedKind!, $first: Int!, $after: String) {\n    feed(kind: $kind, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Notifications($first: Int!, $after: String) {\n    notifications(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          id\n          kind\n          createdAt\n          actor {\n            id\n            handle\n            displayName\n            initials\n            avatarUrl\n            verified\n            role\n          }\n          post {\n            ...PostCardFields\n          }\n          bountyEvent\n          note\n          bounty {\n            id\n            title\n            amountCents\n            status\n            kind\n            viewerIsPoster\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Notifications($first: Int!, $after: String) {\n    notifications(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          id\n          kind\n          createdAt\n          actor {\n            id\n            handle\n            displayName\n            initials\n            avatarUrl\n            verified\n            role\n          }\n          post {\n            ...PostCardFields\n          }\n          bountyEvent\n          note\n          bounty {\n            id\n            title\n            amountCents\n            status\n            kind\n            viewerIsPoster\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LatestNotification {\n    latestNotificationAt\n  }\n"): (typeof documents)["\n  query LatestNotification {\n    latestNotificationAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      bountyCount\n      viewerCanMessage\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      bountyCount\n      viewerCanMessage\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PreviewImageFields on PreviewImage {\n    path\n    alt\n  }\n"): (typeof documents)["\n  fragment PreviewImageFields on PreviewImage {\n    path\n    alt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProfileMetadata($handle: String!) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      bio\n      trustBadge\n      postCount\n      followerCount\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query ProfileMetadata($handle: String!) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      bio\n      trustBadge\n      postCount\n      followerCount\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PostMetadata($id: ID!) {\n    post(id: $id) {\n      id\n      body\n      kind\n      severity\n      area\n      category\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n      topics {\n        id\n        title\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query PostMetadata($id: ID!) {\n    post(id: $id) {\n      id\n      body\n      kind\n      severity\n      area\n      category\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n      topics {\n        id\n        title\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TopicMetadata($slug: String!) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query TopicMetadata($slug: String!) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Followers($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      followers(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Followers($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      followers(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Following($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      following(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Following($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      following(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...UserRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Shell {\n    paymentsStatus\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n"): (typeof documents)["\n  query Shell {\n    paymentsStatus\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n"): (typeof documents)["\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"): (typeof documents)["\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Settings {\n    viewer {\n      id\n      handle\n      displayName\n      bio\n      email\n      initials\n      avatarUrl\n    }\n  }\n"): (typeof documents)["\n  query Settings {\n    viewer {\n      id\n      handle\n      displayName\n      bio\n      email\n      initials\n      avatarUrl\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateProfile($input: UpdateProfileInput!) {\n    updateProfile(input: $input) {\n      id\n      displayName\n      bio\n      initials\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateProfile($input: UpdateProfileInput!) {\n    updateProfile(input: $input) {\n      id\n      displayName\n      bio\n      initials\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n"): (typeof documents)["\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n"): (typeof documents)["\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n"): (typeof documents)["\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n"): (typeof documents)["\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n"): (typeof documents)["\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n"): (typeof documents)["\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n"): (typeof documents)["\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n"): (typeof documents)["\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n      viewerCanMessage\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MessageFields on Message {\n    id\n    body\n    createdAt\n    isMine\n    sender {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n    }\n  }\n"): (typeof documents)["\n  fragment MessageFields on Message {\n    id\n    body\n    createdAt\n    isMine\n    sender {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ConversationRowFields on Conversation {\n    id\n    lastMessageAt\n    unreadCount\n    viewerCanSend\n    lastMessage {\n      id\n      body\n      createdAt\n      isMine\n    }\n    members {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"): (typeof documents)["\n  fragment ConversationRowFields on Conversation {\n    id\n    lastMessageAt\n    unreadCount\n    viewerCanSend\n    lastMessage {\n      id\n      body\n      createdAt\n      isMine\n    }\n    members {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment InboxEventFields on InboxEvent {\n    conversation {\n      ...ConversationRowFields\n    }\n    messageEdge {\n      cursor\n      node {\n        ...MessageFields\n      }\n    }\n    viewer {\n      id\n      unreadConversationCount\n    }\n  }\n"): (typeof documents)["\n  fragment InboxEventFields on InboxEvent {\n    conversation {\n      ...ConversationRowFields\n    }\n    messageEdge {\n      cursor\n      node {\n        ...MessageFields\n      }\n    }\n    viewer {\n      id\n      unreadConversationCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription Inbox {\n    inbox {\n      ...InboxEventFields\n    }\n  }\n"): (typeof documents)["\n  subscription Inbox {\n    inbox {\n      ...InboxEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query InboxState {\n    viewer {\n      id\n      inboxChannel\n      unreadConversationCount\n    }\n  }\n"): (typeof documents)["\n  query InboxState {\n    viewer {\n      id\n      inboxChannel\n      unreadConversationCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Conversations($first: Int!, $after: String) {\n    conversations(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ConversationRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Conversations($first: Int!, $after: String) {\n    conversations(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ConversationRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Conversation($id: ID!, $first: Int!, $after: String) {\n    conversation(id: $id) {\n      ...ConversationRowFields\n      messages(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...MessageFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Conversation($id: ID!, $first: Int!, $after: String) {\n    conversation(id: $id) {\n      ...ConversationRowFields\n      messages(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...MessageFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MessageContacts($query: String) {\n    messageContacts(query: $query, first: 30) {\n      ...UserRowFields\n    }\n  }\n"): (typeof documents)["\n  query MessageContacts($query: String) {\n    messageContacts(query: $query, first: 30) {\n      ...UserRowFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartConversation($userId: ID!) {\n    startConversation(userId: $userId) {\n      ...ConversationRowFields\n    }\n  }\n"): (typeof documents)["\n  mutation StartConversation($userId: ID!) {\n    startConversation(userId: $userId) {\n      ...ConversationRowFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SendMessage($conversationId: ID!, $body: String!) {\n    sendMessage(conversationId: $conversationId, body: $body) {\n      ...InboxEventFields\n    }\n  }\n"): (typeof documents)["\n  mutation SendMessage($conversationId: ID!, $body: String!) {\n    sendMessage(conversationId: $conversationId, body: $body) {\n      ...InboxEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MarkConversationRead($id: ID!) {\n    markConversationRead(id: $id) {\n      ...InboxEventFields\n    }\n  }\n"): (typeof documents)["\n  mutation MarkConversationRead($id: ID!) {\n    markConversationRead(id: $id) {\n      ...InboxEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BountyRowFields on Bounty {\n    id\n    kind\n    status\n    title\n    area\n    amountCents\n    createdAt\n    fundedAt\n    expiresAt\n    closedAt\n    isExpired\n    claimCount\n    viewerIsPoster\n    poster {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"): (typeof documents)["\n  fragment BountyRowFields on Bounty {\n    id\n    kind\n    status\n    title\n    area\n    amountCents\n    createdAt\n    fundedAt\n    expiresAt\n    closedAt\n    isExpired\n    claimCount\n    viewerIsPoster\n    poster {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ClaimFields on BountyClaim {\n    id\n    status\n    body\n    links\n    posterNote\n    confirmNote\n    disputeNote\n    decisionReason\n    decisionNote\n    createdAt\n    approvedAt\n    posterAnswerDue\n    confirmedAt\n    cooldownUntil\n    decidedAt\n    viewerIsClaimant\n    claimant {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  fragment ClaimFields on BountyClaim {\n    id\n    status\n    body\n    links\n    posterNote\n    confirmNote\n    disputeNote\n    decisionReason\n    decisionNote\n    createdAt\n    approvedAt\n    posterAnswerDue\n    confirmedAt\n    cooldownUntil\n    decidedAt\n    viewerIsClaimant\n    claimant {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PayoutAccountFields on PayoutAccount {\n    id\n    bankName\n    bankCode\n    accountName\n    accountLast4\n    status\n    createdAt\n    readyAt\n  }\n"): (typeof documents)["\n  fragment PayoutAccountFields on PayoutAccount {\n    id\n    bankName\n    bankCode\n    accountName\n    accountLast4\n    status\n    createdAt\n    readyAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BountyDetailFields on Bounty {\n    ...BountyRowFields\n    body\n    currency\n    durationDays\n    sapsCaseNumber\n    relationship\n    frozenFromStatus\n    removedAt\n    claimsBeingChecked\n    poster {\n      ...UserRowFields\n      viewerCanMessage\n    }\n    post {\n      id\n      body\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n    }\n    viewerClaim {\n      ...ClaimFields\n    }\n    winningClaim {\n      ...ClaimFields\n    }\n    claims {\n      ...ClaimFields\n      preflight {\n        claimantCreatedAfterBounty\n        claimantHasNoOtherActivity\n        priorPairings\n        payoutNameMismatch\n        payoutAccountAgeHours\n        cooldownEndsAt\n      }\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n    events {\n      id\n      kind\n      claimId\n      byAdmin\n      note\n      createdAt\n      actor {\n        id\n        handle\n        displayName\n        initials\n        avatarUrl\n        verified\n        role\n      }\n    }\n    reports {\n      reason\n      note\n      createdAt\n      reporter {\n        id\n        handle\n        displayName\n      }\n    }\n    ledger {\n      id\n      type\n      status\n      amountCents\n      provider\n      reference\n      providerRef\n      note\n      createdAt\n      settledAt\n    }\n    latestPayout {\n      id\n      status\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  fragment BountyDetailFields on Bounty {\n    ...BountyRowFields\n    body\n    currency\n    durationDays\n    sapsCaseNumber\n    relationship\n    frozenFromStatus\n    removedAt\n    claimsBeingChecked\n    poster {\n      ...UserRowFields\n      viewerCanMessage\n    }\n    post {\n      id\n      body\n      createdAt\n      author {\n        id\n        handle\n        displayName\n      }\n    }\n    viewerClaim {\n      ...ClaimFields\n    }\n    winningClaim {\n      ...ClaimFields\n    }\n    claims {\n      ...ClaimFields\n      preflight {\n        claimantCreatedAfterBounty\n        claimantHasNoOtherActivity\n        priorPairings\n        payoutNameMismatch\n        payoutAccountAgeHours\n        cooldownEndsAt\n      }\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n    events {\n      id\n      kind\n      claimId\n      byAdmin\n      note\n      createdAt\n      actor {\n        id\n        handle\n        displayName\n        initials\n        avatarUrl\n        verified\n        role\n      }\n    }\n    reports {\n      reason\n      note\n      createdAt\n      reporter {\n        id\n        handle\n        displayName\n      }\n    }\n    ledger {\n      id\n      type\n      status\n      amountCents\n      provider\n      reference\n      providerRef\n      note\n      createdAt\n      settledAt\n    }\n    latestPayout {\n      id\n      status\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Bounties($kind: BountyKind, $honoured: Boolean, $first: Int!, $after: String) {\n    bounties(kind: $kind, honoured: $honoured, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Bounties($kind: BountyKind, $honoured: Boolean, $first: Int!, $after: String) {\n    bounties(kind: $kind, honoured: $honoured, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Bounty($id: ID!) {\n    bounty(id: $id) {\n      ...BountyDetailFields\n    }\n  }\n"): (typeof documents)["\n  query Bounty($id: ID!) {\n    bounty(id: $id) {\n      ...BountyDetailFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BountyMetadata($id: ID!) {\n    bounty(id: $id) {\n      id\n      title\n      kind\n      status\n      amountCents\n      area\n      body\n      createdAt\n      poster {\n        id\n        handle\n        displayName\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query BountyMetadata($id: ID!) {\n    bounty(id: $id) {\n      id\n      title\n      kind\n      status\n      amountCents\n      area\n      body\n      createdAt\n      poster {\n        id\n        handle\n        displayName\n      }\n      previewImage {\n        ...PreviewImageFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyBounties($first: Int!, $after: String) {\n    myBounties(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          claims {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query MyBounties($first: Int!, $after: String) {\n    myBounties(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          claims {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyClaims($first: Int!, $after: String) {\n    myClaims(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ClaimFields\n          bounty {\n            ...BountyRowFields\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query MyClaims($first: Int!, $after: String) {\n    myClaims(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...ClaimFields\n          bounty {\n            ...BountyRowFields\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BountyQueue($first: Int!, $after: String) {\n    bountyQueue(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          frozenFromStatus\n          claims {\n            id\n            status\n            createdAt\n            approvedAt\n            posterAnswerDue\n            confirmedAt\n            cooldownUntil\n            claimant {\n              id\n              handle\n            }\n          }\n          reports {\n            reason\n            createdAt\n          }\n          latestPayout {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query BountyQueue($first: Int!, $after: String) {\n    bountyQueue(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...BountyRowFields\n          frozenFromStatus\n          claims {\n            id\n            status\n            createdAt\n            approvedAt\n            posterAnswerDue\n            confirmedAt\n            cooldownUntil\n            claimant {\n              id\n              handle\n            }\n          }\n          reports {\n            reason\n            createdAt\n          }\n          latestPayout {\n            id\n            status\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProfileBounties($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      bounties(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...BountyRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query ProfileBounties($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      id\n      handle\n      displayName\n      isViewer\n      bounties(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...BountyRowFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query HonouredBounties {\n    bounties(honoured: true, first: 3) {\n      edges {\n        node {\n          id\n          title\n          amountCents\n          closedAt\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query HonouredBounties {\n    bounties(honoured: true, first: 3) {\n      edges {\n        node {\n          id\n          title\n          amountCents\n          closedAt\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PaymentsStatus {\n    paymentsStatus\n  }\n"): (typeof documents)["\n  query PaymentsStatus {\n    paymentsStatus\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Banks {\n    banks {\n      name\n      code\n    }\n  }\n"): (typeof documents)["\n  query Banks {\n    banks {\n      name\n      code\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminState {\n    viewer {\n      id\n      viewerIsAdmin\n    }\n  }\n"): (typeof documents)["\n  query AdminState {\n    viewer {\n      id\n      viewerIsAdmin\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PayoutSettings {\n    viewer {\n      id\n      displayName\n      heldBountyIds\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query PayoutSettings {\n    viewer {\n      id\n      displayName\n      heldBountyIds\n      payoutAccount {\n        ...PayoutAccountFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BountyStateFields on Bounty {\n    id\n    status\n    isExpired\n    claimCount\n    fundedAt\n    expiresAt\n    closedAt\n    frozenFromStatus\n  }\n"): (typeof documents)["\n  fragment BountyStateFields on Bounty {\n    id\n    status\n    isExpired\n    claimCount\n    fundedAt\n    expiresAt\n    closedAt\n    frozenFromStatus\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateBounty($input: CreateBountyInput!) {\n    createBounty(input: $input) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreateBounty($input: CreateBountyInput!) {\n    createBounty(input: $input) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetryBountyCheckout($id: ID!) {\n    retryBountyCheckout(id: $id) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation RetryBountyCheckout($id: ID!) {\n    retryBountyCheckout(id: $id) {\n      checkoutUrl\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ConfirmBountyPayment($id: ID!) {\n    confirmBountyPayment(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation ConfirmBountyPayment($id: ID!) {\n    confirmBountyPayment(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SandboxCompleteCheckout($id: ID!, $outcome: String) {\n    sandboxCompleteCheckout(id: $id, outcome: $outcome) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation SandboxCompleteCheckout($id: ID!, $outcome: String) {\n    sandboxCompleteCheckout(id: $id, outcome: $outcome) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CancelBounty($id: ID!) {\n    cancelBounty(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation CancelBounty($id: ID!) {\n    cancelBounty(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RequestBountyCancellation($id: ID!, $note: String!) {\n    requestBountyCancellation(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation RequestBountyCancellation($id: ID!, $note: String!) {\n    requestBountyCancellation(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SubmitClaim($bountyId: ID!, $input: SubmitClaimInput!) {\n    submitClaim(bountyId: $bountyId, input: $input) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SubmitClaim($bountyId: ID!, $input: SubmitClaimInput!) {\n    submitClaim(bountyId: $bountyId, input: $input) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation WithdrawClaim($id: ID!) {\n    withdrawClaim(id: $id) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation WithdrawClaim($id: ID!) {\n    withdrawClaim(id: $id) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ConfirmClaim($id: ID!, $note: String) {\n    confirmClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation ConfirmClaim($id: ID!, $note: String) {\n    confirmClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ObjectToClaim($id: ID!, $note: String!) {\n    objectToClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation ObjectToClaim($id: ID!, $note: String!) {\n    objectToClaim(id: $id, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ReportBounty($id: ID!, $reason: BountyReportReason!, $note: String) {\n    reportBounty(id: $id, reason: $reason, note: $note) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation ReportBounty($id: ID!, $reason: BountyReportReason!, $note: String) {\n    reportBounty(id: $id, reason: $reason, note: $note) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetPayoutAccount($input: PayoutAccountInput!) {\n    setPayoutAccount(input: $input) {\n      ...PayoutAccountFields\n    }\n  }\n"): (typeof documents)["\n  mutation SetPayoutAccount($input: PayoutAccountInput!) {\n    setPayoutAccount(input: $input) {\n      ...PayoutAccountFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DecideClaim($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) {\n    decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation DecideClaim($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) {\n    decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) {\n      id\n      status\n      bounty {\n        ...BountyStateFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetryBountyPayout($id: ID!) {\n    retryBountyPayout(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation RetryBountyPayout($id: ID!) {\n    retryBountyPayout(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ApproveBounty($id: ID!, $note: String!) {\n    approveBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation ApproveBounty($id: ID!, $note: String!) {\n    approveBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeclineBounty($id: ID!, $note: String!) {\n    declineBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation DeclineBounty($id: ID!, $note: String!) {\n    declineBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminCancelBounty($id: ID!, $note: String!, $takeDown: Boolean) {\n    adminCancelBounty(id: $id, note: $note, takeDown: $takeDown) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation AdminCancelBounty($id: ID!, $note: String!, $takeDown: Boolean) {\n    adminCancelBounty(id: $id, note: $note, takeDown: $takeDown) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetryBountyRefund($id: ID!) {\n    retryBountyRefund(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation RetryBountyRefund($id: ID!) {\n    retryBountyRefund(id: $id) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation FreezeBounty($id: ID!, $note: String!) {\n    freezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation FreezeBounty($id: ID!, $note: String!) {\n    freezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnfreezeBounty($id: ID!, $note: String!) {\n    unfreezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"): (typeof documents)["\n  mutation UnfreezeBounty($id: ID!, $note: String!) {\n    unfreezeBounty(id: $id, note: $note) {\n      ...BountyStateFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SweepBounties {\n    sweepBounties {\n      abandoned\n      expired\n      expiring\n      escalated\n      redriven\n      scrubbed\n    }\n  }\n"): (typeof documents)["\n  mutation SweepBounties {\n    sweepBounties {\n      abandoned\n      expired\n      expiring\n      escalated\n      redriven\n      scrubbed\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;