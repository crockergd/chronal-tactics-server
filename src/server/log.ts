export default abstract class Log {
    public static info(text: any): void {
        const now: Date = new Date();
        const timestamp: string = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
        
        console.log('[' + timestamp + '] ' + text);
    }
}