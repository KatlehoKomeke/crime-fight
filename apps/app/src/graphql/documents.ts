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
    location {
      lat
      lng
    }
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
  query Feed($kind: FeedKind!, $near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {
    feed(kind: $kind, near: $near, radiusKm: $radiusKm, first: $first, after: $after) {
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

export const AlertsQuery = graphql(`
  query Alerts($near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {
    alerts(near: $near, radiusKm: $radiusKm, first: $first, after: $after) {
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

export const ShellQuery = graphql(`
  query Shell {
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
    }
  }
`)

export const UnfollowUser = graphql(`
  mutation UnfollowUser($id: ID!) {
    unfollowUser(id: $id) {
      id
      viewerIsFollowing
      followerCount
    }
  }
`)
