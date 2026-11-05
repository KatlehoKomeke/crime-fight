import { graphql } from '@civic/graphql'

/*
 * Every operation the app can send. Codegen turns these into typed documents
 * and a persisted-operation manifest; production accepts nothing else.
 * Each screen asks for exactly the fields it renders — no over-fetching.
 */

export const PostCardFields = graphql(`
  fragment PostCardFields on Post {
    id
    body
    kind
    severity
    area
    category
    createdAt
    replyCount
    likeCount
    repostCount
    viewerHasLiked
    viewerHasSaved
    viewerHasReposted
    viewerCanDelete
    trustBadge
    author {
      id
      handle
      displayName
      initials
      avatarUrl
      verified
      role
    }
    media {
      id
      url
      alt
      caption
      width
      height
    }
    replyTo {
      id
      author {
        id
        handle
      }
    }
    bounty {
      id
      amountCents
      status
      kind
      expiresAt
    }
  }
`)

export const UserRowFields = graphql(`
  fragment UserRowFields on User {
    id
    handle
    displayName
    initials
    avatarUrl
    verified
    role
    viewerIsFollowing
    isViewer
  }
`)

export const FeedQuery = graphql(`
  query Feed($kind: FeedKind!, $first: Int!, $after: String) {
    feed(kind: $kind, first: $first, after: $after) {
      edges {
        cursor
        node {
          ...PostCardFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const NotificationsQuery = graphql(`
  query Notifications($first: Int!, $after: String) {
    notifications(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          kind
          createdAt
          actor {
            id
            handle
            displayName
            initials
            avatarUrl
            verified
            role
          }
          post {
            ...PostCardFields
          }
          bountyEvent
          note
          bounty {
            id
            title
            amountCents
            status
            kind
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const LatestNotificationQuery = graphql(`
  query LatestNotification {
    latestNotificationAt
  }
`)

export const PostQuery = graphql(`
  query Post($id: ID!, $first: Int!, $after: String) {
    post(id: $id) {
      ...PostCardFields
      replies(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...PostCardFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

export const ProfileQuery = graphql(`
  query Profile($handle: String!, $first: Int!, $after: String) {
    user(handle: $handle) {
      ...UserRowFields
      bio
      trustBadge
      createdAt
      followerCount
      followingCount
      postCount
      bountyCount
      viewerCanMessage
      posts(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...PostCardFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

/*
 * Page metadata (title, description, link preview card), fetched by each
 * page's generateMetadata on the server. Separate from the screens' queries,
 * so a card change never alters the operations an open tab sends.
 */

export const PreviewImageFields = graphql(`
  fragment PreviewImageFields on PreviewImage {
    path
    alt
  }
`)

export const ProfileMetadataQuery = graphql(`
  query ProfileMetadata($handle: String!) {
    user(handle: $handle) {
      id
      handle
      displayName
      bio
      trustBadge
      postCount
      followerCount
      previewImage {
        ...PreviewImageFields
      }
    }
  }
`)

export const PostMetadataQuery = graphql(`
  query PostMetadata($id: ID!) {
    post(id: $id) {
      id
      body
      kind
      severity
      area
      category
      createdAt
      author {
        id
        handle
        displayName
      }
      topics {
        id
        title
      }
      previewImage {
        ...PreviewImageFields
      }
    }
  }
`)

export const TopicMetadataQuery = graphql(`
  query TopicMetadata($slug: String!) {
    topic(slug: $slug) {
      id
      slug
      title
      category
      previewImage {
        ...PreviewImageFields
      }
    }
  }
`)

export const FollowersQuery = graphql(`
  query Followers($handle: String!, $first: Int!, $after: String) {
    user(handle: $handle) {
      id
      handle
      displayName
      isViewer
      followers(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...UserRowFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

export const FollowingQuery = graphql(`
  query Following($handle: String!, $first: Int!, $after: String) {
    user(handle: $handle) {
      id
      handle
      displayName
      isViewer
      following(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...UserRowFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

export const TopicQuery = graphql(`
  query Topic($slug: String!, $first: Int!, $after: String) {
    topic(slug: $slug) {
      id
      slug
      title
      category
      posts(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...PostCardFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

export const SearchQuery = graphql(`
  query Search($query: String!, $first: Int!, $after: String) {
    searchUsers(query: $query, first: 4) {
      ...UserRowFields
    }
    search(query: $query, first: $first, after: $after) {
      edges {
        cursor
        node {
          ...PostCardFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const SavedQuery = graphql(`
  query Saved($first: Int!, $after: String) {
    savedPosts(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...PostCardFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

// Prefetched with every page, so the shell knows at first paint whether bounties can be posted.
export const ShellQuery = graphql(`
  query Shell {
    paymentsStatus
    trends(first: 4) {
      postCount
      topic {
        id
        slug
        title
        category
      }
    }
    trustedSources(first: 3) {
      ...UserRowFields
    }
  }
`)

export const TrendsQuery = graphql(`
  query Trends {
    trends(first: 10) {
      postCount
      topic {
        id
        slug
        title
        category
      }
    }
  }
`)

export const ViewerQuery = graphql(`
  query Viewer {
    viewer {
      id
      handle
      displayName
      initials
      avatarUrl
      verified
      role
    }
  }
`)

// Separate from Viewer so the shell's persisted query hash stays stable.
export const SettingsQuery = graphql(`
  query Settings {
    viewer {
      id
      handle
      displayName
      bio
      email
      initials
      avatarUrl
    }
  }
`)

export const UpdateProfile = graphql(`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      displayName
      bio
      initials
    }
  }
`)

export const LikePost = graphql(`
  mutation LikePost($id: ID!) {
    likePost(id: $id) {
      id
      likeCount
      viewerHasLiked
    }
  }
`)

export const UnlikePost = graphql(`
  mutation UnlikePost($id: ID!) {
    unlikePost(id: $id) {
      id
      likeCount
      viewerHasLiked
    }
  }
`)

export const RepostPost = graphql(`
  mutation RepostPost($id: ID!) {
    repostPost(id: $id) {
      id
      repostCount
      viewerHasReposted
    }
  }
`)

export const UnrepostPost = graphql(`
  mutation UnrepostPost($id: ID!) {
    unrepostPost(id: $id) {
      id
      repostCount
      viewerHasReposted
    }
  }
`)

export const SavePost = graphql(`
  mutation SavePost($id: ID!) {
    savePost(id: $id) {
      id
      viewerHasSaved
    }
  }
`)

export const UnsavePost = graphql(`
  mutation UnsavePost($id: ID!) {
    unsavePost(id: $id) {
      id
      viewerHasSaved
    }
  }
`)

export const CreatePost = graphql(`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ...PostCardFields
      replyTo {
        id
        replyCount
      }
    }
  }
`)

export const DeletePost = graphql(`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`)

export const FollowUser = graphql(`
  mutation FollowUser($id: ID!) {
    followUser(id: $id) {
      id
      viewerIsFollowing
      followerCount
      viewerCanMessage
    }
  }
`)

export const UnfollowUser = graphql(`
  mutation UnfollowUser($id: ID!) {
    unfollowUser(id: $id) {
      id
      viewerIsFollowing
      followerCount
      viewerCanMessage
    }
  }
`)

/* Direct messages. Only mutual follows can message each other. */

export const MessageFields = graphql(`
  fragment MessageFields on Message {
    id
    body
    createdAt
    isMine
    sender {
      id
      handle
      displayName
      initials
      avatarUrl
    }
  }
`)

export const ConversationRowFields = graphql(`
  fragment ConversationRowFields on Conversation {
    id
    lastMessageAt
    unreadCount
    viewerCanSend
    lastMessage {
      id
      body
      createdAt
      isMine
    }
    members {
      id
      handle
      displayName
      initials
      avatarUrl
      verified
      role
    }
  }
`)

// The same shape whether it answers a mutation or arrives over the realtime
// channel, so one cache updater handles both (lib/graphql/cache.ts).
export const InboxEventFields = graphql(`
  fragment InboxEventFields on InboxEvent {
    conversation {
      ...ConversationRowFields
    }
    messageEdge {
      cursor
      node {
        ...MessageFields
      }
    }
    viewer {
      id
      unreadConversationCount
    }
  }
`)

// Never sent to /graphql: the API runs this document for each recipient and
// publishes the result to their inbox channel. Only ever add fields to it.
export const InboxSubscription = graphql(`
  subscription Inbox {
    inbox {
      ...InboxEventFields
    }
  }
`)

// Separate from Viewer so the shell's persisted query hash stays stable.
export const InboxStateQuery = graphql(`
  query InboxState {
    viewer {
      id
      inboxChannel
      unreadConversationCount
    }
  }
`)

export const ConversationsQuery = graphql(`
  query Conversations($first: Int!, $after: String) {
    conversations(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...ConversationRowFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const ConversationQuery = graphql(`
  query Conversation($id: ID!, $first: Int!, $after: String) {
    conversation(id: $id) {
      ...ConversationRowFields
      messages(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...MessageFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

export const MessageContactsQuery = graphql(`
  query MessageContacts($query: String) {
    messageContacts(query: $query, first: 30) {
      ...UserRowFields
    }
  }
`)

export const StartConversation = graphql(`
  mutation StartConversation($userId: ID!) {
    startConversation(userId: $userId) {
      ...ConversationRowFields
    }
  }
`)

export const SendMessage = graphql(`
  mutation SendMessage($conversationId: ID!, $body: String!) {
    sendMessage(conversationId: $conversationId, body: $body) {
      ...InboxEventFields
    }
  }
`)

export const MarkConversationRead = graphql(`
  mutation MarkConversationRead($id: ID!) {
    markConversationRead(id: $id) {
      ...InboxEventFields
    }
  }
`)

/*
 * Bounties: rewards paid in up front and held by CIVIC/ONE until the poster
 * confirms a claim and an administrator verifies it (docs/adr/0006-bounties.md).
 */

export const BountyRowFields = graphql(`
  fragment BountyRowFields on Bounty {
    id
    kind
    status
    title
    area
    amountCents
    createdAt
    fundedAt
    expiresAt
    closedAt
    isExpired
    claimCount
    viewerIsPoster
    poster {
      id
      handle
      displayName
      initials
      avatarUrl
      verified
      role
    }
  }
`)

export const ClaimFields = graphql(`
  fragment ClaimFields on BountyClaim {
    id
    status
    body
    links
    posterNote
    disputeNote
    decisionReason
    decisionNote
    createdAt
    confirmedAt
    cooldownUntil
    rejectedAt
    decidedAt
    viewerIsClaimant
    claimant {
      id
      handle
      displayName
      initials
      avatarUrl
      verified
      role
      createdAt
    }
  }
`)

export const PayoutAccountFields = graphql(`
  fragment PayoutAccountFields on PayoutAccount {
    id
    bankName
    bankCode
    accountName
    accountLast4
    status
    createdAt
    readyAt
  }
`)

// Everything the detail page shows anyone. Claims, reports and the ledger come
// back empty or null unless the viewer is the poster or an administrator.
export const BountyDetailFields = graphql(`
  fragment BountyDetailFields on Bounty {
    ...BountyRowFields
    body
    currency
    durationDays
    sapsCaseNumber
    relationship
    frozenFromStatus
    poster {
      ...UserRowFields
      viewerCanMessage
    }
    post {
      id
      body
      createdAt
      author {
        id
        handle
        displayName
      }
    }
    viewerClaim {
      ...ClaimFields
    }
    winningClaim {
      ...ClaimFields
    }
    claims {
      ...ClaimFields
      preflight {
        claimantCreatedAfterBounty
        claimantHasNoOtherActivity
        priorPairings
        payoutNameMismatch
        payoutAccountAgeHours
        cooldownEndsAt
      }
      payoutAccount {
        ...PayoutAccountFields
      }
    }
    events {
      id
      kind
      claimId
      byAdmin
      note
      createdAt
      actor {
        id
        handle
        displayName
        initials
        avatarUrl
        verified
        role
      }
    }
    reports {
      reason
      note
      createdAt
      reporter {
        id
        handle
        displayName
      }
    }
    ledger {
      id
      type
      status
      amountCents
      provider
      reference
      providerRef
      note
      createdAt
      settledAt
    }
    latestPayout {
      id
      status
      createdAt
    }
  }
`)

export const BountiesQuery = graphql(`
  query Bounties($kind: BountyKind, $honoured: Boolean, $first: Int!, $after: String) {
    bounties(kind: $kind, honoured: $honoured, first: $first, after: $after) {
      edges {
        cursor
        node {
          ...BountyRowFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const BountyQuery = graphql(`
  query Bounty($id: ID!) {
    bounty(id: $id) {
      ...BountyDetailFields
    }
  }
`)

export const BountyMetadataQuery = graphql(`
  query BountyMetadata($id: ID!) {
    bounty(id: $id) {
      id
      title
      kind
      status
      amountCents
      area
      body
      createdAt
      poster {
        id
        handle
        displayName
      }
      previewImage {
        ...PreviewImageFields
      }
    }
  }
`)

export const MyBountiesQuery = graphql(`
  query MyBounties($first: Int!, $after: String) {
    myBounties(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...BountyRowFields
          claims {
            id
            status
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const MyClaimsQuery = graphql(`
  query MyClaims($first: Int!, $after: String) {
    myClaims(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...ClaimFields
          bounty {
            ...BountyRowFields
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const BountyQueueQuery = graphql(`
  query BountyQueue($first: Int!, $after: String) {
    bountyQueue(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...BountyRowFields
          frozenFromStatus
          claims {
            id
            status
            createdAt
            confirmedAt
            cooldownUntil
            claimant {
              id
              handle
            }
          }
          reports {
            reason
            createdAt
          }
          latestPayout {
            id
            status
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

export const ProfileBountiesQuery = graphql(`
  query ProfileBounties($handle: String!, $first: Int!, $after: String) {
    user(handle: $handle) {
      id
      handle
      displayName
      isViewer
      bounties(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...BountyRowFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

// The right rail in the Bounties section: the latest rewards that were paid out.
export const HonouredBountiesQuery = graphql(`
  query HonouredBounties {
    bounties(honoured: true, first: 3) {
      edges {
        node {
          id
          title
          amountCents
          closedAt
        }
      }
    }
  }
`)

// Separate from Shell so its persisted hash stays stable; cached once per session.
export const PaymentsStatusQuery = graphql(`
  query PaymentsStatus {
    paymentsStatus
  }
`)

export const BanksQuery = graphql(`
  query Banks {
    banks {
      name
      code
    }
  }
`)

// Separate from Viewer so the shell's persisted query hash stays stable.
export const AdminStateQuery = graphql(`
  query AdminState {
    viewer {
      id
      viewerIsAdmin
    }
  }
`)

export const PayoutSettingsQuery = graphql(`
  query PayoutSettings {
    viewer {
      id
      displayName
      heldBountyIds
      payoutAccount {
        ...PayoutAccountFields
      }
    }
  }
`)

// What a mutation can change about a bounty. Mutations return only this and the
// cache drops the rest of the entity (bountyChanged in lib/graphql/cache.ts), so
// the screens showing it refetch: every operation stays small, and nothing shown
// after an action is older than the action.
export const BountyStateFields = graphql(`
  fragment BountyStateFields on Bounty {
    id
    status
    isExpired
    claimCount
    fundedAt
    expiresAt
    closedAt
    frozenFromStatus
  }
`)

export const CreateBounty = graphql(`
  mutation CreateBounty($input: CreateBountyInput!) {
    createBounty(input: $input) {
      checkoutUrl
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const RetryBountyCheckout = graphql(`
  mutation RetryBountyCheckout($id: ID!) {
    retryBountyCheckout(id: $id) {
      checkoutUrl
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const ConfirmBountyPayment = graphql(`
  mutation ConfirmBountyPayment($id: ID!) {
    confirmBountyPayment(id: $id) {
      ...BountyStateFields
    }
  }
`)

// Local and test only; the API refuses it anywhere else.
export const SandboxCompleteCheckout = graphql(`
  mutation SandboxCompleteCheckout($id: ID!, $outcome: String) {
    sandboxCompleteCheckout(id: $id, outcome: $outcome) {
      ...BountyStateFields
    }
  }
`)

export const CancelBounty = graphql(`
  mutation CancelBounty($id: ID!) {
    cancelBounty(id: $id) {
      ...BountyStateFields
    }
  }
`)

export const RequestBountyCancellation = graphql(`
  mutation RequestBountyCancellation($id: ID!, $note: String!) {
    requestBountyCancellation(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const SubmitClaim = graphql(`
  mutation SubmitClaim($bountyId: ID!, $input: SubmitClaimInput!) {
    submitClaim(bountyId: $bountyId, input: $input) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const WithdrawClaim = graphql(`
  mutation WithdrawClaim($id: ID!) {
    withdrawClaim(id: $id) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const ConfirmClaim = graphql(`
  mutation ConfirmClaim($id: ID!, $note: String) {
    confirmClaim(id: $id, note: $note) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const RejectClaim = graphql(`
  mutation RejectClaim($id: ID!, $note: String!) {
    rejectClaim(id: $id, note: $note) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const DisputeClaim = graphql(`
  mutation DisputeClaim($id: ID!, $note: String!) {
    disputeClaim(id: $id, note: $note) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const ReportBounty = graphql(`
  mutation ReportBounty($id: ID!, $reason: BountyReportReason!, $note: String) {
    reportBounty(id: $id, reason: $reason, note: $note) {
      id
    }
  }
`)

export const SetPayoutAccount = graphql(`
  mutation SetPayoutAccount($input: PayoutAccountInput!) {
    setPayoutAccount(input: $input) {
      ...PayoutAccountFields
    }
  }
`)

/* Administrators. */

export const DecideClaim = graphql(`
  mutation DecideClaim($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) {
    decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) {
      id
      status
      bounty {
        ...BountyStateFields
      }
    }
  }
`)

export const RetryBountyPayout = graphql(`
  mutation RetryBountyPayout($id: ID!) {
    retryBountyPayout(id: $id) {
      ...BountyStateFields
    }
  }
`)

export const ApproveBounty = graphql(`
  mutation ApproveBounty($id: ID!, $note: String!) {
    approveBounty(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const DeclineBounty = graphql(`
  mutation DeclineBounty($id: ID!, $note: String!) {
    declineBounty(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const AdminCancelBounty = graphql(`
  mutation AdminCancelBounty($id: ID!, $note: String!) {
    adminCancelBounty(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const FreezeBounty = graphql(`
  mutation FreezeBounty($id: ID!, $note: String!) {
    freezeBounty(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const UnfreezeBounty = graphql(`
  mutation UnfreezeBounty($id: ID!, $note: String!) {
    unfreezeBounty(id: $id, note: $note) {
      ...BountyStateFields
    }
  }
`)

export const SweepBounties = graphql(`
  mutation SweepBounties {
    sweepBounties {
      abandoned
      expired
      expiring
      escalated
      redriven
    }
  }
`)
