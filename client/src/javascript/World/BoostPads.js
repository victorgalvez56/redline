import * as THREE from 'three'

const BOOST_SPEED    = 16      // m/s added in car's forward direction on trigger
const BOOST_COOLDOWN = 2200    // ms before pad re-activates after use
const TRIGGER_RADIUS = 4.2     // m — proximity distance to trigger
const PAD_Z          = 0.025   // just above track surface

function _makeTexture()
{
    const W = 256, H = 128
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    // Three bright chevrons, pointing in +X
    const chevrons = [60, 120, 185]
    chevrons.forEach(cx =>
    {
        ctx.beginPath()
        ctx.moveTo(cx - 20, 18)
        ctx.lineTo(cx + 22, H / 2)
        ctx.lineTo(cx - 20, H - 18)
        ctx.strokeStyle = 'rgba(255, 170, 0, 1)'
        ctx.lineWidth   = 9
        ctx.lineCap     = 'round'
        ctx.lineJoin    = 'round'
        ctx.stroke()

        // Outer glow pass
        ctx.beginPath()
        ctx.moveTo(cx - 20, 18)
        ctx.lineTo(cx + 22, H / 2)
        ctx.lineTo(cx - 20, H - 18)
        ctx.strokeStyle = 'rgba(255, 220, 80, 0.35)'
        ctx.lineWidth   = 18
        ctx.stroke()
    })

    return new THREE.CanvasTexture(canvas)
}

export default class BoostPads
{
    constructor(_options)
    {
        this._physics = _options.physics
        this._time    = _options.time
        this._onBoost = _options.onBoost || null

        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        const texture = _makeTexture()

        // Two pads: bottom straight and top straight (both travel roughly in +X)
        const defs = [
            { x: 22,  y: -35, angle: 0 },
            { x: 15,  y:  41, angle: 0 },
        ]
        defs.forEach((def, i) => this._addPad(def, texture, i))
    }

    _addPad({ x, y, angle }, texture, idx)
    {
        const mat = new THREE.MeshBasicMaterial({
            map:         texture,
            transparent: true,
            opacity:     0.7,
            depthWrite:  false,
            side:        THREE.DoubleSide,
            blending:    THREE.AdditiveBlending,
        })

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), mat)
        mesh.position.set(x, y, PAD_Z)
        mesh.rotation.z  = angle
        mesh.matrixAutoUpdate = true
        this.container.add(mesh)

        this._pads.push({
            x, y, mesh, mat,
            cooldown: 0,
            phase: idx * Math.PI,   // offset pulse phases so they don't sync
        })
    }

    _pads = []

    update()
    {
        const dt   = Math.min(this._time.delta, 60)
        const now  = this._time.elapsed
        const body = this._physics.car.chassis.body
        const pos  = body.position

        for(const pad of this._pads)
        {
            const active = pad.cooldown <= 0

            if(active)
            {
                // Pulse brightness
                pad.mat.opacity = 0.45 + Math.sin(now * 0.005 + pad.phase) * 0.28

                // Proximity check
                const dx = pos.x - pad.x
                const dy = pos.y - pad.y
                if(dx * dx + dy * dy < TRIGGER_RADIUS * TRIGGER_RADIUS)
                {
                    this._applyBoost(body)
                    pad.cooldown = BOOST_COOLDOWN
                    this._onBoost?.()
                }
            }
            else
            {
                pad.cooldown -= dt
                // Dim while cooling down — flash on as it reactivates
                const cool = Math.max(pad.cooldown, 0) / BOOST_COOLDOWN
                pad.mat.opacity = 0.08 + (1 - cool) * 0.25
            }
        }
    }

    _applyBoost(body)
    {
        const quat = body.quaternion
        const hx   =  1 - 2 * (quat.y * quat.y + quat.z * quat.z)
        const hy   =  2 * (quat.x * quat.y + quat.z * quat.w)
        // Add speed in car's forward direction, capped so it doesn't stack infinitely
        const curFwd = body.velocity.x * hx + body.velocity.y * hy
        const add    = Math.max(BOOST_SPEED - curFwd, 0)
        body.velocity.x += hx * add
        body.velocity.y += hy * add
    }
}
