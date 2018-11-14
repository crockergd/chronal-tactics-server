import GameRoom from './gameroom';
import ClientSettings from './clientsettings';

export default class GameSocket {
    public initialized: boolean;
    public active: boolean;
    public matched: boolean;
    public room: GameRoom;
    public settings: ClientSettings;

    public get socket(): SocketIO.Socket {
        return this._socket;
    }

    public get alive(): boolean {
        if (!this.initialized) return true;
        if (!this.active) return false;
        if (!this.socket.connected) return false;
        return true;
    }

    constructor(readonly key: string, private readonly _socket: SocketIO.Socket) {
        this.initialized = false;
        this.active = true;
        this.matched = false;

        this.socket.on('disconnect', () => {
            this.active = false;
        });
    }
}