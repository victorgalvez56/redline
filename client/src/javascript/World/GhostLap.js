import * as THREE from 'three'

const RECORD_INTERVAL = 50       // ms between recorded frames
const LG_KEY          = 'rg:ghostLap'
const STRIDE          = 7        // floats per frame: x,y,z,qx,qy,qz,qw

export default class GhostLap
{
    constructor(_options)
    {
        this._physics  = _options.physics
        this._time     = _options.time
        this._lapTimer = _options.lapTimer

        this._recording      = []   // flat Float32 of current lap
        this._recordTimer    = 0
        this._recordingActive = false

        this._ghost      = []       // flat array of best lap frames
        this._playTime   = 0
        this._playing    = false

        this._buildMesh()
        this._load()

        // On lap complete: save if new best, restart recording + playback
        this._lapTimer.on('lap', ({ isNewBest }) =>
        {
            if(isNewBest) this._save()
            this._recording = []
            this._recordTimer = 0
            this._startPlayback()
        })
    }

    // Called once, right when the race starts (countdown ends)
    begin()
    {
        this._recording      = []
        this._recordTimer    = 0
        this._recordingActive = true
        this._startPlayback()
    }

    update()
    {
        const dt = Math.min(this._time.delta, 60)

        // ── Record ──────────────────────────────────────────────────────────
        if(this._recordingActive && this._lapTimer._active)
        {
            this._recordTimer += dt
            if(this._recordTimer >= RECORD_INTERVAL)
            {
                this._recordTimer = 0
                const pos  = this._physics.car.chassis.body.position
                const quat = this._physics.car.chassis.body.quaternion
                this._recording.push(pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w)
            }
        }

        // ── Playback ─────────────────────────────────────────────────────────
        if(!this._playing || this._ghost.length === 0)
        {
            if(this._container.visible) this._container.visible = false
            return
        }

        this._playTime += dt
        const totalFrames = this._ghost.length / STRIDE
        const frameF  = this._playTime / RECORD_INTERVAL
        const i0      = Math.floor(frameF)

        if(i0 >= totalFrames - 1)
        {
            this._container.visible = false
            return
        }

        const i1  = i0 + 1
        const t   = frameF - i0
        const b0  = i0 * STRIDE
        const b1  = i1 * STRIDE

        // Lerp position
        this._container.position.set(
            THREE.MathUtils.lerp(this._ghost[b0],     this._ghost[b1],     t),
            THREE.MathUtils.lerp(this._ghost[b0 + 1], this._ghost[b1 + 1], t),
            THREE.MathUtils.lerp(this._ghost[b0 + 2], this._ghost[b1 + 2], t),
        )

        // Slerp rotation
        _q0.set(this._ghost[b0 + 3], this._ghost[b0 + 4], this._ghost[b0 + 5], this._ghost[b0 + 6])
        _q1.set(this._ghost[b1 + 3], this._ghost[b1 + 4], this._ghost[b1 + 5], this._ghost[b1 + 6])
        _q0.slerp(_q1, t)
        this._container.quaternion.copy(_q0)
        this._container.visible = true
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _buildMesh()
    {
        this._container = new THREE.Object3D()

        const mat = new THREE.MeshBasicMaterial({
            color:       0x88ccff,
            transparent: true,
            opacity:     0.28,
            depthWrite:  false,
            side:        THREE.DoubleSide,
        })

        // Body block
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.3, 0.6), mat)
        body.position.z = 0.3
        // Cabin block
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.45), mat)
        cabin.position.z = 0.78

        this._container.add(body)
        this._container.add(cabin)
        this._container.visible = false
    }

    _startPlayback()
    {
        this._playTime = 0
        this._playing  = this._ghost.length > 0
    }

    _save()
    {
        if(this._recording.length === 0) return
        this._ghost = [...this._recording]
        try { localStorage.setItem(LG_KEY, JSON.stringify(this._ghost)) } catch(_) {}
    }

    _load()
    {
        try
        {
            const raw = localStorage.getItem(LG_KEY)
            if(raw) this._ghost = JSON.parse(raw)
        }
        catch(_) {}
    }
}

// Scratch quaternions reused each frame to avoid GC pressure
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion()
