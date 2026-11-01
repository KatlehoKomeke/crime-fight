export const MESSAGE_MAX_LENGTH = 2000

/** Direct messages are only possible between two people who follow each other. */
export const canMessage = (viewerFollows: boolean, followsViewer: boolean) => viewerFollows && followsViewer
