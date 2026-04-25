import * as THREE from 'three'

const BODY_MATCAP = [
    'matcapRedTexture',
    'matcapBlueTexture',
    'matcapEmeraldGreenTexture',
    'matcapOrangeTexture',
    'matcapPurpleTexture',
    'matcapEmeraldGreenTexture',
    'matcapRedTexture',
    'matcapWhiteTexture',
]

export default class LobbyPreview
{
    constructor({ canvas, resources })
    {
        this.canvas    = canvas
        this.resources = resources
        this.colorIdx  = 0
        this.carType   = 'default'
        this._rafId    = null

        this._init()
    }

    _init()
    {
        const w = this.canvas.parentElement?.clientWidth || 320
        const h = Math.round(w * 0.55)

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.setSize(w, h, false)
        this.renderer.setClearColor(0x000000, 0)

        this.scene  = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 50)

        // Match the game's Z-up coordinate system
        this.camera.up.set(0, 0, 1)
        // Front-right-above view: car faces +X, so we sit at positive X, negative Y, positive Z
        this.camera.position.set(3.2, -2.8, 2.2)
        this.camera.lookAt(0, 0, 0.3)

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this._buildCar()
        this._animate()
    }

    _buildCar()
    {
        // Remove old car
        while(this.group.children.length > 0) this.group.remove(this.group.children[0])

        const texKey = BODY_MATCAP[this.colorIdx % BODY_MATCAP.length]
        const matcap = this.resources.items[texKey]
        const mat    = new THREE.MeshMatcapMaterial({ matcap })

        const prefix     = this.carType === 'cybertruck' ? 'carCyberTruck' : 'carDefault'
        const chassisKey = `${prefix}Chassis`
        const item       = this.resources.items[chassisKey]

        if(item)
        {
            const clone = item.scene.clone(true)
            clone.traverse(child => { if(child.isMesh) child.material = mat })
            this.group.add(clone)
        }

        // Center the group on origin
        const box    = new THREE.Box3().setFromObject(this.group)
        const center = box.getCenter(new THREE.Vector3())
        this.group.position.sub(center)
        // Lift slightly so it sits above ground visually
        this.group.position.z += (box.max.z - box.min.z) * 0.5
    }

    setColor(idx)
    {
        if(this.colorIdx === idx) return
        this.colorIdx = idx
        this._buildCar()
    }

    setCarType(type)
    {
        if(this.carType === type) return
        this.carType = type
        this._buildCar()
    }

    _animate()
    {
        this._rafId = requestAnimationFrame(() => this._animate())
        this.group.rotation.z += 0.009
        this.renderer.render(this.scene, this.camera)
    }

    destroy()
    {
        if(this._rafId) cancelAnimationFrame(this._rafId)
        this._rafId = null
        this.renderer.dispose()
    }
}
