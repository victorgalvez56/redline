import * as THREE from 'three'

const MISSILE_SPEED      = 55      // m/s
const MISSILE_LIFE_MS    = 3500    // auto-destroy after this
const FIRE_COOLDOWN_MS   = 750     // min ms between shots
const CAR_HIT_RADIUS_SQ  = 2.5 ** 2
const WALL_THRESH_SQ     = (7 + 1.5) ** 2   // off-track threshold

export default class Weapons
{
    constructor(_options)
    {
        this.scene            = _options.scene
        this.physics          = _options.physics
        this.centerPath       = _options.centerPath   || []
        this.remoteCarManager = _options.remoteCarManager || null
        this.onHitCar         = _options.onHitCar     || null   // (carId, dmg) => {}
        this.onFire           = _options.onFire        || null   // () => {}

        this.ammo      = 10
        this._cooldown = 0
        this._missiles  = []
        this._explosions = []

        // Shared geometries / materials
        this._mGeo = new THREE.SphereGeometry(0.28, 6, 4)
        this._mMat = new THREE.MeshBasicMaterial({ color: 0xff5500 })
        this._gGeo = new THREE.SphereGeometry(0.55, 6, 4)
        this._gMat = new THREE.MeshBasicMaterial({
            color: 0xff9900, transparent: true, opacity: 0.3,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
    }

    // ── Public API ───────────────────────────────────────────────────────────

    fire()
    {
        if(this.ammo <= 0 || this._cooldown > 0) return false

        const body = this.physics.car.chassis.body
        const q    = body.quaternion
        const hx   = 1 - 2 * (q.y * q.y + q.z * q.z)
        const hy   = 2 * (q.x * q.y + q.z * q.w)
        const len  = Math.sqrt(hx * hx + hy * hy) || 1
        const dx = hx / len, dy = hy / len

        const pos = body.position
        this._spawn(pos.x + dx * 3, pos.y + dy * 3, pos.z + 0.4, dx, dy)

        this.ammo--
        this._cooldown = FIRE_COOLDOWN_MS
        if(this.onFire) this.onFire()
        return true
    }

    addAmmo(n) { this.ammo = Math.min(this.ammo + n, 20) }

    // ── Update ───────────────────────────────────────────────────────────────

    update(dt)
    {
        this._cooldown = Math.max(0, this._cooldown - dt)

        for(let i = this._missiles.length - 1; i >= 0; i--)
        {
            const m = this._missiles[i]
            m.life += dt

            if(m.life > MISSILE_LIFE_MS) { this._explode(m); this._removeMissile(i); continue }

            const dist = MISSILE_SPEED * dt / 1000
            m.x += m.dx * dist
            m.y += m.dy * dist

            m.body.position.set(m.x, m.y, m.z)
            m.glow.position.set(m.x, m.y, m.z)

            // Wall hit
            if(this._offTrack(m.x, m.y)) { this._explode(m); this._removeMissile(i); continue }

            // Remote car hit
            if(this.remoteCarManager)
            {
                let hit = false
                for(const [id, car] of this.remoteCarManager.cars)
                {
                    const p  = car.container.position
                    const dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z
                    if(dx*dx + dy*dy + dz*dz < CAR_HIT_RADIUS_SQ)
                    {
                        this._explode(m)
                        this._removeMissile(i)
                        if(this.onHitCar) this.onHitCar(id, 30)
                        hit = true; break
                    }
                }
                if(hit) continue
            }
        }

        // Explosion animations
        for(let i = this._explosions.length - 1; i >= 0; i--)
        {
            const e = this._explosions[i]
            e.t += dt
            const p = e.t / e.dur
            if(p >= 1) { this.scene.remove(e.mesh); e.mesh.material.dispose(); this._explosions.splice(i, 1); continue }
            e.mesh.scale.setScalar(1 + p * 6)
            e.mesh.material.opacity = 0.65 * (1 - p)
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    _spawn(x, y, z, dx, dy)
    {
        const body = new THREE.Mesh(this._mGeo, this._mMat)
        const glow = new THREE.Mesh(this._gGeo, this._gMat)
        body.position.set(x, y, z)
        glow.position.set(x, y, z)
        body.frustumCulled = false
        glow.frustumCulled = false
        this.scene.add(body)
        this.scene.add(glow)
        this._missiles.push({ x, y, z, dx, dy, life: 0, body, glow })
    }

    _explode(m)
    {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff7700, transparent: true, opacity: 0.65,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mat)
        mesh.position.set(m.x, m.y, m.z)
        mesh.frustumCulled = false
        this.scene.add(mesh)
        this._explosions.push({ mesh, t: 0, dur: 420 })
    }

    _removeMissile(i)
    {
        const m = this._missiles[i]
        this.scene.remove(m.body)
        this.scene.remove(m.glow)
        this._missiles.splice(i, 1)
    }

    _offTrack(x, y)
    {
        let minSq = Infinity
        for(const pt of this.centerPath)
        {
            const dx = pt.x - x, dy = pt.y - y
            const sq = dx * dx + dy * dy
            if(sq < minSq) minSq = sq
        }
        return minSq > WALL_THRESH_SQ
    }
}
