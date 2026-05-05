import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter
{
    /**
     * Constructor
     */
    constructor()
    {
        super()

        this.start = Date.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16

        this.tick = this.tick.bind(this)
        this.tick()
    }

    /**
     * Tick
     */
    // Switch from window.requestAnimationFrame to renderer.setAnimationLoop
    // so that render calls land inside the correct XR session frame.
    useRendererLoop(renderer)
    {
        if(this.ticker) window.cancelAnimationFrame(this.ticker)
        this._useRendererLoop = true
        renderer.setAnimationLoop(this.tick)
    }

    tick()
    {
        if(!this._useRendererLoop)
        {
            this.ticker = window.requestAnimationFrame(this.tick)
        }

        const current = Date.now()

        this.delta = current - this.current
        this.elapsed = current - this.start
        this.current = current

        if(this.delta > 60)
        {
            this.delta = 60
        }

        this.trigger('tick')
    }

    /**
     * Stop
     */
    stop()
    {
        window.cancelAnimationFrame(this.ticker)
    }
}
