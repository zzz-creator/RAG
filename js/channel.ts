/** Rail Announcements Generator. By zzz-creator, MIT license, 2018 */

/** Cross-window communication channel using BroadcastChannel */
class ScenarioChannel
{
    private channel: BroadcastChannel | null = null;
    private listeners: { [type: string]: Array<(data: any) => void> } = {};

    public constructor()
    {
        if (typeof BroadcastChannel !== 'undefined')
        {
            try
            {
                this.channel = new BroadcastChannel('rag_scenario_channel');
                this.channel.onmessage = (event: MessageEvent) =>
                {
                    let msg = event.data;
                    if (msg && msg.type)
                    {
                        let handlers = this.listeners[msg.type];
                        if (handlers)
                        {
                            handlers.forEach(h => h(msg));
                        }
                    }
                };
            }
            catch (e)
            {
                console.warn('BroadcastChannel not supported or failed:', e);
            }
        }
    }

    public on(type: string, handler: (data: any) => void): void
    {
        if (!this.listeners[type])
            this.listeners[type] = [];

        this.listeners[type].push(handler);
    }

    public off(type: string, handler: (data: any) => void): void
    {
        let handlers = this.listeners[type];
        if (!handlers)
            return;

        let i = handlers.indexOf(handler);
        if (i !== -1)
            handlers.splice(i, 1);
    }

    public send(type: string, payload: any = {}): void
    {
        if (this.channel)
        {
            try
            {
                this.channel.postMessage(Object.assign({ type: type }, payload));
            }
            catch (e)
            {
                console.warn('Failed to send BroadcastChannel message:', e);
            }
        }
    }
}

(window as any).ScenarioChannel = ScenarioChannel;
