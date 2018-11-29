export const enum SocketState {
    CREATED,
    INITIALIZED,
    MATCHMAKING,
    MATCHMAKING_TRAINING,
    MATCHED,
    DEPLOYMENT,
    BATTLE,
    DEAD
}

export default SocketState;