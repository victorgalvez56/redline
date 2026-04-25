import EventEmitter from './Utils/EventEmitter.js'

const BEST_LAP_KEY    = 'rg:bestLap'
const BEST_SECTOR_KEY = 'rg:bestSector:'

export default class LapTimer extends EventEmitter
{
    constructor()
    {
        super()
        this._lapStart      = null
        this._bestLap       = this._loadBest()
        this._lapCount      = 0
        this._active        = false
        this._lastSign      = null
        this._gateOrigin    = null
        this._gateDir       = null

        // Sector support
        this._sectorGates   = []   // [{origin, dir, lastSign, bestMs, idx}]
        this._currentSector = 0
        this._sectorStart   = null
    }

    setGate(origin, dir)
    {
        this._gateOrigin = origin
        this._gateDir    = dir
    }

    // Call once per sector checkpoint (in order around the track)
    addSector(origin, dir)
    {
        const idx    = this._sectorGates.length
        const bestMs = this._loadSectorBest(idx)
        this._sectorGates.push({ origin, dir, lastSign: null, bestMs, idx })
    }

    start()
    {
        this._active        = true
        this._invalid       = false
        this._lapStart      = performance.now()
        this._lastSign      = null
        this._currentSector = 0
        this._sectorStart   = performance.now()
        for(const sg of this._sectorGates) sg.lastSign = null
    }

    // Mark current lap as invalid (won't be saved as best, won't go to leaderboard)
    invalidate()
    {
        this._invalid = true
    }

    stop()
    {
        this._active = false
    }

    tick(carBody)
    {
        if(!this._active || !this._gateOrigin || !this._gateDir) return

        const pos = carBody.position

        // ── Main lap gate ────────────────────────────────────────────────────
        {
            const dx   = pos.x - this._gateOrigin.x
            const dy   = pos.y - this._gateOrigin.y
            const dot  = dx * this._gateDir.x + dy * this._gateDir.y
            const sign = dot >= 0 ? 1 : -1

            if(this._lastSign === -1 && sign === 1) this._onGateCrossed()
            this._lastSign = sign
        }

        // ── Current sector gate (check only the next expected one) ────────────
        if(this._currentSector < this._sectorGates.length)
        {
            const sg   = this._sectorGates[this._currentSector]
            const dx   = pos.x - sg.origin.x
            const dy   = pos.y - sg.origin.y
            const dot  = dx * sg.dir.x + dy * sg.dir.y
            const sign = dot >= 0 ? 1 : -1

            if(sg.lastSign === -1 && sign === 1) this._onSectorCrossed(sg)
            sg.lastSign = sign
        }
    }

    _onSectorCrossed(sg)
    {
        const now      = performance.now()
        const sectorMs = now - (this._sectorStart ?? this._lapStart ?? now)
        const isNewBest = sg.bestMs === null || sectorMs < sg.bestMs

        if(isNewBest)
        {
            sg.bestMs = sectorMs
            this._saveSectorBest(sg.idx, sectorMs)
        }

        this._sectorStart   = now
        this._currentSector++

        this.trigger('sector', [{ sectorIdx: sg.idx, sectorMs, isNewBest, bestMs: sg.bestMs }])
    }

    _onGateCrossed()
    {
        const now     = performance.now()
        const elapsed = this._lapStart !== null ? now - this._lapStart : 0

        if(elapsed < 10000)
        {
            this._lapStart      = now
            this._sectorStart   = now
            this._currentSector = 0
            this._invalid       = false
            for(const sg of this._sectorGates) sg.lastSign = null
            return
        }

        this._lapCount++
        const lapMs     = elapsed
        const invalid   = this._invalid
        const isNewBest = !invalid && (this._bestLap === null || lapMs < this._bestLap)

        if(isNewBest) this._saveBest(lapMs)

        this._lapStart      = now
        this._sectorStart   = now
        this._currentSector = 0
        this._invalid       = false
        for(const sg of this._sectorGates) sg.lastSign = null

        this.trigger('lap', [{ lapMs, lapCount: this._lapCount, isNewBest, bestMs: this._bestLap, invalid }])
    }

    getCurrentMs()
    {
        if(!this._active || this._lapStart === null) return 0
        return performance.now() - this._lapStart
    }

    getBestMs()   { return this._bestLap  }
    getLapCount() { return this._lapCount }

    getDeltaMs()
    {
        if(this._bestLap === null || this._lapCount === 0) return null
        return this.getCurrentMs() - this._bestLap
    }

    _loadBest()
    {
        const v = localStorage.getItem(BEST_LAP_KEY)
        return v ? parseFloat(v) : null
    }

    _saveBest(ms)
    {
        localStorage.setItem(BEST_LAP_KEY, ms)
        this._bestLap = ms
    }

    _loadSectorBest(idx)
    {
        const v = localStorage.getItem(BEST_SECTOR_KEY + idx)
        return v ? parseFloat(v) : null
    }

    _saveSectorBest(idx, ms)
    {
        localStorage.setItem(BEST_SECTOR_KEY + idx, ms)
    }

    static fmt(ms)
    {
        if(ms === null || ms === undefined || ms < 0) return '--:--.---'
        const totalS = Math.floor(ms / 1000)
        const m      = Math.floor(totalS / 60)
        const s      = totalS % 60
        const milli  = Math.floor(ms % 1000)
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`
    }

    static fmtSplit(ms)
    {
        const sign = ms >= 0 ? '+' : '-'
        const abs  = Math.abs(ms)
        return `${sign}${(abs / 1000).toFixed(3)}s`
    }
}
