import GameRoom from './gameroom';

export default class GameSocket {
    public active: boolean;
    public matched: boolean;
    public room: GameRoom;

    public get socket(): SocketIO.Socket {
        return this._socket;
    }

    constructor(readonly key: string, private readonly _socket: SocketIO.Socket) {
        this.matched = false;
        this.active = true;

        this.socket.on('disconnect', () => {
            this.active = false;
        });
    }
}