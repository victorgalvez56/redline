import * as THREE from 'three'
import * as dat from 'dat.gui'

import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import World from './World/index.js'
import Resources from './Resources.js'
import Camera from './Camera.js'
import Network from './Network.js'
import LobbyUI from './LobbyUI.js'
import Chat from './Chat.js'
import EntryFlow from './EntryFlow.js'

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import BlurPass from './Passes/Blur.js'
import GlowsPass from './Passes/Glows.js'

export default class Application
{
    constructor(_options)
    {
        this.$canvas = _options.$canvas

        this.time      = new Time()
        this.sizes     = new Sizes()
        this.resources = new Resources()

        this.setConfig()
        this.setDebug()
        this.setRenderer()
        this.setCamera()
        this.setPasses()

        // Track resource state so we can notify World even if it's created after ready fires
        this._resourcesReady = false
        this.resources.on('ready', () =>
        {
            this._resourcesReady = true
            this.world?.onResourcesReady()
        })

        this._setupLoadingScreen()
        this._setupEntryFlow()

        // Connect to the multiplayer server immediately on page load so the
        // status pill reads "CONNECTING… → CONNECTED" before the user even
        // sees the menu. Saves them from clicking ENTER and discovering the
        // server is down.
        this.setNetwork()
        this._setupConnectionStatus()
    }

    setConfig()
    {
        this.config = {}
        this.config.debug      = window.location.hash === '#debug'
        this.config.cyberTruck = window.location.hash === '#cybertruck'
        this.config.touch      = false
        this.config.soloMode   = false                  // multiplayer-only
        this.config.gameMode   = 'race'                 // 'race' | 'combat'

        window.addEventListener('touchstart', () =>
        {
            this.config.touch = true
            this.world?.controls.setTouch()

            this.passes.horizontalBlurPass.strength = 1
            this.passes.horizontalBlurPass.material.uniforms.uStrength.value = new THREE.Vector2(this.passes.horizontalBlurPass.strength, 0)
            this.passes.verticalBlurPass.strength = 1
            this.passes.verticalBlurPass.material.uniforms.uStrength.value = new THREE.Vector2(0, this.passes.verticalBlurPass.strength)
        }, { once: true })
    }

    setDebug()
    {
        if(this.config.debug)
        {
            this.debug = new dat.GUI({ width: 420 })
        }
    }

    setRenderer()
    {
        this.scene = new THREE.Scene()

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.$canvas,
            alpha: true,
            powerPreference: 'high-performance'
        })
        this.renderer.setClearColor(0x000000, 1)
        this.renderer.setPixelRatio(2)
        this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        this.renderer.autoClear = false

        this.sizes.on('resize', () =>
        {
            this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        })
    }

    setCamera()
    {
        this.camera = new Camera({
            time:     this.time,
            sizes:    this.sizes,
            renderer: this.renderer,
            debug:    this.debug,
            config:   this.config
        })

        this.scene.add(this.camera.container)
    }

    setPasses()
    {
        this.passes = {}

        if(this.debug)
        {
            this.passes.debugFolder = this.debug.addFolder('postprocess')
        }

        this.passes.composer    = new EffectComposer(this.renderer)
        this.passes.renderPass  = new RenderPass(this.scene, this.camera.instance)

        this.passes.horizontalBlurPass = new ShaderPass(BlurPass)
        this.passes.horizontalBlurPass.strength = this.config.touch ? 0 : 1
        this.passes.horizontalBlurPass.material.uniforms.uResolution.value = new THREE.Vector2(this.sizes.viewport.width, this.sizes.viewport.height)
        this.passes.horizontalBlurPass.material.uniforms.uStrength.value   = new THREE.Vector2(this.passes.horizontalBlurPass.strength, 0)

        this.passes.verticalBlurPass = new ShaderPass(BlurPass)
        this.passes.verticalBlurPass.strength = this.config.touch ? 0 : 1
        this.passes.verticalBlurPass.material.uniforms.uResolution.value = new THREE.Vector2(this.sizes.viewport.width, this.sizes.viewport.height)
        this.passes.verticalBlurPass.material.uniforms.uStrength.value   = new THREE.Vector2(0, this.passes.verticalBlurPass.strength)

        this.passes.glowsPass = new ShaderPass(GlowsPass)
        this.passes.glowsPass.color = '#ffcfe0'
        this.passes.glowsPass.material.uniforms.uPosition.value = new THREE.Vector2(0, 0.25)
        this.passes.glowsPass.material.uniforms.uRadius.value   = 0.7
        this.passes.glowsPass.material.uniforms.uColor.value    = new THREE.Color(this.passes.glowsPass.color)
        this.passes.glowsPass.material.uniforms.uColor.value.convertLinearToSRGB()
        this.passes.glowsPass.material.uniforms.uAlpha.value    = 0.55

        this.passes.composer.addPass(this.passes.renderPass)
        this.passes.composer.addPass(this.passes.horizontalBlurPass)
        this.passes.composer.addPass(this.passes.verticalBlurPass)
        this.passes.composer.addPass(this.passes.glowsPass)

        this.time.on('tick', () =>
        {
            this.passes.horizontalBlurPass.enabled = this.passes.horizontalBlurPass.material.uniforms.uStrength.value.x > 0
            this.passes.verticalBlurPass.enabled   = this.passes.verticalBlurPass.material.uniforms.uStrength.value.y > 0
            this.passes.composer.render()
        })

        this.sizes.on('resize', () =>
        {
            this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
            this.passes.composer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
            this.passes.horizontalBlurPass.material.uniforms.uResolution.value.x = this.sizes.viewport.width
            this.passes.horizontalBlurPass.material.uniforms.uResolution.value.y = this.sizes.viewport.height
            this.passes.verticalBlurPass.material.uniforms.uResolution.value.x   = this.sizes.viewport.width
            this.passes.verticalBlurPass.material.uniforms.uResolution.value.y   = this.sizes.viewport.height
        })
    }

    _setupEntryFlow()
    {
        // Wait for the loading screen to finish before showing the title.
        // EntryFlow drives Title → Menu → Onboarding and finally calls onComplete
        // with config.gameMode and config.soloMode set.
        this.resources.on('ready', () =>
        {
            this._entryFlow = new EntryFlow({
                config:     this.config,
                onComplete: () => this._initGame(),
            })
        })
    }

    _initGame()
    {
        // Network already created in constructor — just spin up the lobby
        // and the World. Lobby uses the existing connection.
        this.lobbyUI = new LobbyUI({
            network:    this.network,
            config:     this.config,
            onSoloJoin: () => this.world?.onSoloJoin(),
        })
        this.setWorld()
        this.setTitle()

        // Resources may have already finished loading before World was created
        if(this._resourcesReady) this.world.onResourcesReady()
    }

    setNetwork()
    {
        // Multiplayer-only — always create the Network and connect now
        this.network = new Network()
        this.network.connect()
        this.chat    = new Chat({ network: this.network })
    }

    _setupConnectionStatus()
    {
        const $el = document.getElementById('rl-conn-status')
        if(!$el || !this.network) return

        const $label = $el.querySelector('.rl-conn-label')
        let onlineCount = 0
        let everConnected = false

        const setState = (state, text) =>
        {
            $el.classList.remove('connecting', 'connected', 'disconnected')
            $el.classList.add(state)
            if($label) $label.textContent = text
        }

        const refresh = () =>
        {
            const ms = this.network.latency
            const ping = (ms !== undefined && ms !== null) ? ` · ${ms}MS` : ''

            // Pick base state class on ping quality (only when connected)
            let cls = 'connected'
            if(typeof ms === 'number')
            {
                if(ms > 220) cls = 'bad-ping'
                else if(ms > 110) cls = 'lagging'
            }

            if(onlineCount > 1)        setState(cls, `ONLINE · ${onlineCount}P${ping}`)
            else if(onlineCount === 1) setState(cls, `ONLINE · 1P${ping}`)
            else                       setState(cls, `CONNECTED${ping}`)
        }

        // Initial state
        setState('connecting', 'CONNECTING…')

        this.network.on('connected', () =>
        {
            everConnected = true
            refresh()
        })

        this.network.on('disconnected', () =>
        {
            onlineCount = 0
            setState('disconnected', everConnected ? 'DISCONNECTED · RETRYING' : 'SERVER UNREACHABLE')
        })

        this.network.on('room:joined', ({ existingPlayers }) =>
        {
            onlineCount = (existingPlayers?.length ?? 0) + 1
            refresh()
        })

        this.network.on('player:joined', () => { onlineCount++;                              refresh() })
        this.network.on('player:left',   () => { onlineCount = Math.max(1, onlineCount - 1); refresh() })
        this.network.on('ping',          () => { refresh() })
    }

    _setupLoadingScreen()
    {
        const $screen = document.getElementById('loading-screen')
        const $fill   = document.getElementById('loading-bar-fill')
        const $tip    = document.getElementById('loading-tip')
        if(!$screen) return

        const tips = [
            'WASD to drive · SHIFT to boost',
            'X to brake · SPACE to jump',
            'F to fire · R if you get stuck',
            'Race clean. Or wreck everything.',
            'Missiles home. Don\'t waste them on walls.',
            'Three modes. One track. Pick your lane.',
        ]
        let tipIdx = 0
        $tip.textContent = tips[0]

        const tipInterval = setInterval(() =>
        {
            $tip.style.opacity = '0'
            setTimeout(() =>
            {
                tipIdx = (tipIdx + 1) % tips.length
                $tip.textContent   = tips[tipIdx]
                $tip.style.opacity = '1'
            }, 300)
        }, 2500)

        this.resources.on('progress', (ratio) =>
        {
            $fill.style.width = `${Math.round(ratio * 100)}%`
        })

        this.resources.on('ready', () =>
        {
            clearInterval(tipInterval)
            $fill.style.width = '100%'
            setTimeout(() =>
            {
                $screen.classList.add('fade-out')
                setTimeout(() => $screen.remove(), 700)
            }, 400)
        })
    }

    setWorld()
    {
        this.world = new World({
            config:    this.config,
            debug:     this.debug,
            resources: this.resources,
            time:      this.time,
            sizes:     this.sizes,
            camera:    this.camera,
            scene:     this.scene,
            renderer:  this.renderer,
            passes:    this.passes,
            network:   this.network
        })
        this.scene.add(this.world.container)
    }

    setTitle()
    {
        this.title = {}
        this.title.frequency        = 300
        this.title.width            = 20
        this.title.position         = 0
        this.title.$element         = document.querySelector('title')
        this.title.absolutePosition = Math.round(this.title.width * 0.25)

        this.time.on('tick', () =>
        {
            if(this.world && this.world.physics)
            {
                this.title.absolutePosition += this.world.physics.car.forwardSpeed
                if(this.title.absolutePosition < 0) this.title.absolutePosition = 0
            }
        })

        window.setInterval(() =>
        {
            this.title.position = Math.round(this.title.absolutePosition % this.title.width)
            document.title = `${'_'.repeat(this.title.width - this.title.position)}🏎${'_'.repeat(this.title.position)}`
        }, this.title.frequency)
    }
}
