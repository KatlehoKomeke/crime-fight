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
    "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    location {\n      lat\n      lng\n    }\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n  }\n": typeof types.PostCardFieldsFragmentDoc,
    "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n": typeof types.UserRowFieldsFragmentDoc,
    "\n  query Feed($kind: FeedKind!, $near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    feed(kind: $kind, near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.FeedDocument,
    "\n  query Alerts($near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    alerts(near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.AlertsDocument,
    "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.PostDocument,
    "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.ProfileDocument,
    "\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.TopicDocument,
    "\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.SearchDocument,
    "\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.SavedDocument,
    "\n  query Shell {\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n": typeof types.ShellDocument,
    "\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n": typeof types.TrendsDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": typeof types.ViewerDocument,
    "\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": typeof types.LikePostDocument,
    "\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": typeof types.UnlikePostDocument,
    "\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": typeof types.RepostPostDocument,
    "\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": typeof types.UnrepostPostDocument,
    "\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": typeof types.SavePostDocument,
    "\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": typeof types.UnsavePostDocument,
    "\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n": typeof types.CreatePostDocument,
    "\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n": typeof types.DeletePostDocument,
    "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n": typeof types.FollowUserDocument,
    "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n": typeof types.UnfollowUserDocument,
};
const documents: Documents = {
    "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    location {\n      lat\n      lng\n    }\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n  }\n": types.PostCardFieldsFragmentDoc,
    "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n": types.UserRowFieldsFragmentDoc,
    "\n  query Feed($kind: FeedKind!, $near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    feed(kind: $kind, near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.FeedDocument,
    "\n  query Alerts($near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    alerts(near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.AlertsDocument,
    "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.PostDocument,
    "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.ProfileDocument,
    "\n  query Topic($slug: String!, $first: Int!, $after: String) {\n    topic(slug: $slug) {\n      id\n      slug\n      title\n      category\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.TopicDocument,
    "\n  query Search($query: String!, $first: Int!, $after: String) {\n    searchUsers(query: $query, first: 4) {\n      ...UserRowFields\n    }\n    search(query: $query, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.SearchDocument,
    "\n  query Saved($first: Int!, $after: String) {\n    savedPosts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.SavedDocument,
    "\n  query Shell {\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n": types.ShellDocument,
    "\n  query Trends {\n    trends(first: 10) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n  }\n": types.TrendsDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n  }\n": types.ViewerDocument,
    "\n  mutation LikePost($id: ID!) {\n    likePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": types.LikePostDocument,
    "\n  mutation UnlikePost($id: ID!) {\n    unlikePost(id: $id) {\n      id\n      likeCount\n      viewerHasLiked\n    }\n  }\n": types.UnlikePostDocument,
    "\n  mutation RepostPost($id: ID!) {\n    repostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": types.RepostPostDocument,
    "\n  mutation UnrepostPost($id: ID!) {\n    unrepostPost(id: $id) {\n      id\n      repostCount\n      viewerHasReposted\n    }\n  }\n": types.UnrepostPostDocument,
    "\n  mutation SavePost($id: ID!) {\n    savePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": types.SavePostDocument,
    "\n  mutation UnsavePost($id: ID!) {\n    unsavePost(id: $id) {\n      id\n      viewerHasSaved\n    }\n  }\n": types.UnsavePostDocument,
    "\n  mutation CreatePost($input: CreatePostInput!) {\n    createPost(input: $input) {\n      ...PostCardFields\n      replyTo {\n        id\n        replyCount\n      }\n    }\n  }\n": types.CreatePostDocument,
    "\n  mutation DeletePost($id: ID!) {\n    deletePost(id: $id)\n  }\n": types.DeletePostDocument,
    "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n": types.FollowUserDocument,
    "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n": types.UnfollowUserDocument,
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
export function graphql(source: "\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    location {\n      lat\n      lng\n    }\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n  }\n"): (typeof documents)["\n  fragment PostCardFields on Post {\n    id\n    body\n    kind\n    severity\n    area\n    category\n    createdAt\n    replyCount\n    likeCount\n    repostCount\n    viewerHasLiked\n    viewerHasSaved\n    viewerHasReposted\n    viewerCanDelete\n    trustBadge\n    location {\n      lat\n      lng\n    }\n    author {\n      id\n      handle\n      displayName\n      initials\n      avatarUrl\n      verified\n      role\n    }\n    media {\n      id\n      url\n      alt\n      caption\n      width\n      height\n    }\n    replyTo {\n      id\n      author {\n        id\n        handle\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n"): (typeof documents)["\n  fragment UserRowFields on User {\n    id\n    handle\n    displayName\n    initials\n    avatarUrl\n    verified\n    role\n    viewerIsFollowing\n    isViewer\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Feed($kind: FeedKind!, $near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    feed(kind: $kind, near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Feed($kind: FeedKind!, $near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    feed(kind: $kind, near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Alerts($near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    alerts(near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query Alerts($near: GeoInput, $radiusKm: Float, $first: Int!, $after: String) {\n    alerts(near: $near, radiusKm: $radiusKm, first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFields\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Post($id: ID!, $first: Int!, $after: String) {\n    post(id: $id) {\n      ...PostCardFields\n      replies(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Profile($handle: String!, $first: Int!, $after: String) {\n    user(handle: $handle) {\n      ...UserRowFields\n      bio\n      trustBadge\n      createdAt\n      followerCount\n      followingCount\n      postCount\n      posts(first: $first, after: $after) {\n        edges {\n          cursor\n          node {\n            ...PostCardFields\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query Shell {\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n"): (typeof documents)["\n  query Shell {\n    trends(first: 4) {\n      postCount\n      topic {\n        id\n        slug\n        title\n        category\n      }\n    }\n    trustedSources(first: 3) {\n      ...UserRowFields\n    }\n  }\n"];
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
export function graphql(source: "\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n"): (typeof documents)["\n  mutation FollowUser($id: ID!) {\n    followUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n"): (typeof documents)["\n  mutation UnfollowUser($id: ID!) {\n    unfollowUser(id: $id) {\n      id\n      viewerIsFollowing\n      followerCount\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;