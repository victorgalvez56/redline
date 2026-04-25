import * as THREE from 'three'

const MAX_PARTICLES  = 80
const LIFETIME_MS    = 1100    // particle life in ms
const EMIT_INTERVAL  = 45      // ms between spawns per wheel
const MIN_LATERAL    = 2.8     // m/s lateral slip to trigger
const MIN_SPEED      = 3.0     // m/s minimum total speed

function _makeTexture()
{
    const size   = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx  = canvas.getContext('2d')
    const half = size / 2
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
    grad.addColorStop(0,   'rgba(210,210,210,0.9)')
    grad.addColorStop(0.4, 'rgba(170,170,170,0.5)')
    grad.addColorStop(1,   'rgba(130,130,130,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(half, half, half, 0, Math.PI * 2)
    ctx.fill()
    return new THREE.CanvasTexture(canvas)
}

export default class SmokeParticles
{
    constructor(_options)
    {
        this.physics   = _options.physics
        this.time      = _options.time
        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        const texture = _makeTexture()

        // Pre-allocate pool — each particle gets its own material so opacity is independent
        this._pool = []
        for(let i = 0; i < MAX_PARTICLES; i++)
        {
            const mat = new THREE.SpriteMaterial({
                map:         texture,
                transparent: true,
                depthWrite:  false,
                blending:    THREE.NormalBlending,
                opacity:     0,
            })
            const sprite = new THREE.Sprite(mat)
            sprite.visible = false
            this.container.add(sprite)
            this._pool.push({ sprite, mat, active: false, age: 0, lifetime: 0, vx: 0, vy: 0, vz: 0 })
        }

        // Per-wheel emission timer (rear wheels: indices 2 & 3)
        this._emitTimer = [0, 0]
    }

    update()
    {
        const dt      = Math.min(this.time.delta, 60)    // ms, capped
        const body    = this.physics.car.chassis.body
        const infos   = this.physics.car.vehicle.wheelInfos
        const vel     = body.velocity
        const quat    = body.quaternion

        // Lateral slip
        const hx      =  1 - 2 * (quat.y * quat.y + quat.z * quat.z)
        const hy      =  2 * (quat.x * quat.y + quat.z * quat.w)
        const speed   = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
        const lateral = Math.abs(vel.x * hy - vel.y * hx)
        const skidding = speed > MIN_SPEED && lateral > MIN_LATERAL

        // Emit from rear wheels
        if(skidding)
        {
            for(let wi = 2; wi <= 3; wi++)
            {
                const idx = wi - 2
                this._emitTimer[idx] += dt
                if(this._emitTimer[idx] >= EMIT_INTERVAL)
                {
                    this._emitTimer[idx] = 0
                    const wp = infos[wi].worldTransform.position
                    this._spawn(wp.x, wp.y, wp.z + 0.1)
                }
            }
        }
        else
        {
            this._emitTimer[0] = 0
            this._emitTimer[1] = 0
        }

        // Update live particles
        const dtSec = dt / 1000
        for(const p of this._pool)
        {
            if(!p.active) continue

            p.age += dt
            if(p.age >= p.lifetime)
            {
                p.active = false
                p.sprite.visible = false
                continue
            }

            const t = p.age / p.lifetime   // 0 → 1

            p.sprite.position.x += p.vx * dtSec
            p.sprite.position.y += p.vy * dtSec
            p.sprite.position.z += p.vz * dtSec

            // Expand from 0.4 to 2.4 world units
            p.sprite.scale.setScalar(THREE.MathUtils.lerp(0.4, 2.4, t))

            // Fade: quick ramp-in, slow fade-out
            const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85
            p.mat.opacity = alpha * 0.55
        }
    }

    _spawn(x, y, z)
    {
        const p = this._pool.find(p => !p.active)
        if(!p) return

        p.active   = true
        p.age      = 0
        p.lifetime = LIFETIME_MS * (0.8 + Math.random() * 0.4)

        p.sprite.position.set(x, y, z)
        p.sprite.scale.setScalar(0.4)
        p.sprite.visible = true
        p.mat.opacity    = 0

        // Random outward drift + upward float
        const angle = Math.random() * Math.PI * 2
        const sv    = 0.6 + Math.random() * 0.8
        p.vx = Math.cos(angle) * sv * 0.4
        p.vy = Math.sin(angle) * sv * 0.4
        p.vz = 1.0 + Math.random() * 1.2
    }
}
