import LapTimer from './LapTimer.js'

const LB_KEY     = 'rg:lapTimes'
const LB_MAX     = 5
const LB_SHOW_MS = 5000

export default class HUD
{
    constructor(_options)
    {
        this.lapTimer = _options.lapTimer
        this.physics  = _options.physics

        this.$hud   = document.getElementById('race-hud')
        this.$lap   = document.getElementById('hud-lap')
        this.$time  = document.getElementById('hud-time')
        this.$best  = document.getElementById('hud-best')
        this.$delta = document.getElementById('hud-delta')
        this.$speed = document.getElementById('hud-speed')
        this.$note  = document.getElementById('hud-lap-note')
        this.$lb    = document.getElementById('leaderboard')
        this.$lbList= document.getElementById('lb-list')
        this.$gear  = document.getElementById('hud-gear')

        this._noteTimer = null
        this._lbTimer   = null
        this._lapSummaryTimer = null

        // Track per-lap sector times and whether each was a new best
        this._lastSectorMs      = [null, null]
        this._lapSectorIsNewBest = [false, false]
        this._prevBestLap       = this.lapTimer.getBestMs()
        this._lapMaxSpeed       = 0

        this._times = this._loadTimes()
        this._renderLeaderboard()

        this.lapTimer.on('lap', ({ lapMs, lapCount, isNewBest, invalid }) =>
        {
            this._onLap(lapMs, lapCount, isNewBest, invalid)
        })

        this.lapTimer.on('sector', ({ sectorIdx, sectorMs, isNewBest, bestMs }) =>
        {
            this._onSector(sectorIdx, sectorMs, isNewBest, bestMs)
        })
    }

    show()
    {
        if(this.$hud)   this.$hud.style.display   = 'flex'
        if(this.$speed) this.$speed.style.display = 'block'
        if(this.$gear)  this.$gear.style.display  = 'block'
        const $st = document.getElementById('sector-timing')
        if($st) $st.style.display = 'block'
    }

    update()
    {
        if(!this.$hud) return

        const currentMs = this.lapTimer.getCurrentMs()
        const bestMs    = this.lapTimer.getBestMs()
        const delta     = this.lapTimer.getDeltaMs()
        const lapCount  = this.lapTimer.getLapCount()

        if(this.$time)
            this.$time.textContent = LapTimer.fmt(currentMs)

        if(this.$lap)
            this.$lap.textContent = `LAP ${lapCount + 1}`

        if(this.$best)
            this.$best.textContent = bestMs !== null ? `BEST  ${LapTimer.fmt(bestMs)}` : ''

        if(this.$delta)
        {
            if(delta !== null && lapCount > 0)
            {
                const sign = delta > 0 ? '+' : ''
                this.$delta.textContent = `${sign}${(delta / 1000).toFixed(3)}s`
                this.$delta.style.color = delta > 0 ? '#e74c3c' : '#2ecc71'
            }
            else
            {
                this.$delta.textContent = ''
            }
        }

        if(this.$speed && this.physics)
        {
            const vel = this.physics.car.chassis.body.velocity
            const kmh = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) * 3.6
            this.$speed.textContent = `${Math.round(kmh)}`
            if(this.lapTimer._active && kmh > this._lapMaxSpeed) this._lapMaxSpeed = kmh

            if(this.$gear)
            {
                const thresholds = [0, 22, 46, 76, 112, 150]
                let gear = 1
                for(let g = thresholds.length - 1; g >= 0; g--)
                {
                    if(kmh >= thresholds[g]) { gear = g + 1; break }
                }
                this.$gear.textContent = `G${gear}`
            }
        }
    }

    // ── Leaderboard ────────────────────────────────────────────────────────

    _loadTimes()
    {
        try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]') }
        catch { return [] }
    }

    _saveTimes()
    {
        localStorage.setItem(LB_KEY, JSON.stringify(this._times))
    }

    _recordTime(ms)
    {
        this._times.push(ms)
        this._times.sort((a, b) => a - b)
        this._times = this._times.slice(0, LB_MAX)
        this._saveTimes()
    }

    _renderLeaderboard()
    {
        if(!this.$lbList) return
        this.$lbList.innerHTML = ''
        const best = this._times[0] ?? null

        this._times.forEach((ms, i) =>
        {
            const li = document.createElement('li')
            if(ms === best) li.className = 'lb-best'

            const rank = document.createElement('span')
            rank.className   = 'lb-rank'
            rank.textContent = `#${i + 1}`

            const time = document.createElement('span')
            time.className   = 'lb-time'
            time.textContent = LapTimer.fmt(ms)

            li.appendChild(rank)
            li.appendChild(time)
            this.$lbList.appendChild(li)
        })
    }

    _showLeaderboard()
    {
        if(!this.$lb) return
        this.$lb.classList.add('visible')
        clearTimeout(this._lbTimer)
        this._lbTimer = setTimeout(() =>
        {
            this.$lb.classList.remove('visible')
        }, LB_SHOW_MS)
    }

    // ── Lap event ─────────────────────────────────────────────────────────

    _onLap(lapMs, lapCount, isNewBest, invalid)
    {
        if(this.$lap) this.$lap.textContent = `LAP ${lapCount + 1}`

        const prevBest = this._prevBestLap
        this._prevBestLap = this.lapTimer.getBestMs()

        if(!invalid)
        {
            this._recordTime(lapMs)
            this._renderLeaderboard()
            this._showLeaderboard()
        }

        const msg = invalid
            ? '⛔  LAP INVALID'
            : isNewBest
                ? `🏆  NEW BEST!  ${LapTimer.fmt(lapMs)}`
                : `Lap ${lapCount}  ·  ${LapTimer.fmt(lapMs)}`
        const color = invalid ? '#e74c3c' : isNewBest ? '#f1c40f' : '#fff'
        this._showNote(msg, color)

        if(isNewBest && this.$time)
        {
            this.$time.style.color = '#f1c40f'
            setTimeout(() => { if(this.$time) this.$time.style.color = '' }, 1800)
        }

        // Fill S3 in sector bar, then schedule a reset
        const s3Ms = (this._lastSectorMs[0] !== null && this._lastSectorMs[1] !== null)
            ? lapMs - this._lastSectorMs[0] - this._lastSectorMs[1]
            : null
        const $s3t = document.getElementById('st-s3-time')
        if($s3t && s3Ms !== null) { $s3t.textContent = LapTimer.fmt(s3Ms); $s3t.style.color = invalid ? '#e74c3c' : '#fff' }
        setTimeout(() => this._resetSectorBar(), 5500)

        this._showLapSummary(lapMs, isNewBest, prevBest, invalid)
    }

    showBoost()
    {
        this._showNote('⚡ BOOST!', '#ffaa00')
    }

    _onSector(idx, sectorMs, isNewBest, bestMs)
    {
        this._lastSectorMs[idx]       = sectorMs
        this._lapSectorIsNewBest[idx] = isNewBest

        // Update sector timing bar
        const $t = document.getElementById(`st-s${idx + 1}-time`)
        const $d = document.getElementById(`st-s${idx + 1}-delta`)
        if($t) { $t.textContent = LapTimer.fmt(sectorMs); $t.style.color = isNewBest ? '#cc88ff' : '#fff' }
        if($d)
        {
            if(isNewBest)
            {
                $d.textContent = 'BEST'; $d.style.color = '#cc88ff'
            }
            else if(bestMs !== null)
            {
                const d = sectorMs - bestMs
                $d.textContent = LapTimer.fmtSplit(d)
                $d.style.color = d <= 0 ? '#2ecc71' : '#e74c3c'
            }
            else
            {
                $d.textContent = ''; $d.style.color = ''
            }
        }

        const label = `S${idx + 1}`
        if(isNewBest)
        {
            this._showNote(`🟣 ${label}  ${LapTimer.fmt(sectorMs)}`, '#cc88ff')
        }
        else if(bestMs !== null)
        {
            const delta = sectorMs - bestMs
            const sign  = delta > 0 ? '+' : ''
            const color = delta > 0 ? '#e74c3c' : '#2ecc71'
            this._showNote(`${label}  ${sign}${(delta / 1000).toFixed(3)}s`, color)
        }
        else
        {
            this._showNote(`${label}  ${LapTimer.fmt(sectorMs)}`, '#fff')
        }
    }

    _resetSectorBar()
    {
        for(let i = 1; i <= 3; i++)
        {
            const $t = document.getElementById(`st-s${i}-time`)
            const $d = document.getElementById(`st-s${i}-delta`)
            if($t) { $t.textContent = '--:--.---'; $t.style.color = '' }
            if($d) { $d.textContent = ''; $d.style.color = '' }
        }
    }

    _showNote(text, color)
    {
        if(!this.$note) return
        this.$note.textContent   = text
        this.$note.style.color   = color
        this.$note.style.opacity = '1'
        clearTimeout(this._noteTimer)
        this._noteTimer = setTimeout(() =>
        {
            if(this.$note) this.$note.style.opacity = '0'
        }, 3200)
    }

    // ── Lap summary card ──────────────────────────────────────────────────

    _showLapSummary(lapMs, isNewBest, prevBestMs, invalid = false)
    {
        const $card = document.getElementById('lap-summary')
        if(!$card) return

        const $title = document.getElementById('lap-summary-title')
        if($title) $title.textContent = invalid ? '⛔ LAP INVALID' : 'Lap complete'

        const s1Ms = this._lastSectorMs[0]
        const s2Ms = this._lastSectorMs[1]
        const s3Ms = (s1Ms !== null && s2Ms !== null) ? lapMs - s1Ms - s2Ms : null

        const setVal = (id, ms, color) =>
        {
            const el = document.getElementById(id)
            if(!el) return
            el.textContent  = ms !== null ? LapTimer.fmt(ms) : '--:--.---'
            el.style.color  = color || '#fff'
        }

        const setDelta = (id, ms, bestMs) =>
        {
            const el = document.getElementById(id)
            if(!el) return
            if(ms === null || bestMs === null) { el.textContent = ''; return }
            const delta = ms - bestMs
            el.textContent = LapTimer.fmtSplit(delta)
            el.style.color  = delta <= 0 ? '#2ecc71' : '#e74c3c'
        }

        const sg = this.lapTimer._sectorGates

        const $spd = document.getElementById('ls-speed')
        if($spd) $spd.textContent = this._lapMaxSpeed > 0 ? `${Math.round(this._lapMaxSpeed)}` : '---'
        this._lapMaxSpeed = 0

        setVal('ls-s1', s1Ms, this._lapSectorIsNewBest[0] ? '#cc88ff' : '#fff')
        setVal('ls-s2', s2Ms, this._lapSectorIsNewBest[1] ? '#cc88ff' : '#fff')
        setVal('ls-s3', s3Ms, '#fff')
        setVal('ls-total', lapMs, isNewBest ? '#f1c40f' : '#fff')

        // Sector deltas: compare against best AFTER this lap (which may have been updated)
        // If this sector was a new best, delta would be 0 — hide it to avoid confusion
        if(this._lapSectorIsNewBest[0])
            { const el = document.getElementById('ls-ds1'); if(el) { el.textContent = 'BEST'; el.style.color = '#cc88ff' } }
        else
            setDelta('ls-ds1', s1Ms, sg[0]?.bestMs ?? null)

        if(this._lapSectorIsNewBest[1])
            { const el = document.getElementById('ls-ds2'); if(el) { el.textContent = 'BEST'; el.style.color = '#cc88ff' } }
        else
            setDelta('ls-ds2', s2Ms, sg[1]?.bestMs ?? null)

        const $ds3 = document.getElementById('ls-ds3')
        if($ds3) { $ds3.textContent = ''; }

        if(isNewBest)
        {
            const $dtotal = document.getElementById('ls-dtotal')
            if($dtotal) { $dtotal.textContent = 'BEST'; $dtotal.style.color = '#f1c40f' }
        }
        else
        {
            setDelta('ls-dtotal', lapMs, prevBestMs)
        }

        // Reset for next lap
        this._lastSectorMs       = [null, null]
        this._lapSectorIsNewBest = [false, false]

        $card.classList.add('visible')
        clearTimeout(this._lapSummaryTimer)
        this._lapSummaryTimer = setTimeout(() => $card.classList.remove('visible'), 5500)
    }
}
