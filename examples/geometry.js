import * as THREE from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import {
	Brush,
	Evaluator,
	EdgesHelper,
	TriangleSetHelper,
	ADDITION,
	SUBTRACTION,
	INTERSECTION,
	DIFFERENCE,
} from '..';

const params = {

	operation: SUBTRACTION,
	wireframe: false,
	displayBrushes: false,
	shadows: true,

	randomize: () => {

		randomizeBrushes();
		updateCSG();

	}
};

let renderer, camera, scene, controls, gui, outputContainer;
let bunnyBrush, brushes;
let material, surfaceSampler;
let resultObject, wireframeResult, light;
let edgesHelper, trisHelper;
let csgEvaluator = new Evaluator();
csgEvaluator.attributes = [ 'position', 'normal' ];

init();

async function init() {

	const bgColor = 0x111111;

	outputContainer = document.getElementById( 'output' );

	// renderer setup
	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( bgColor, 1 );
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputEncoding = THREE.sRGBEncoding;
	document.body.appendChild( renderer.domElement );

	// scene setup
	scene = new THREE.Scene();

	// lights
	light = new THREE.DirectionalLight( 0xffffff, 1 );
	light.position.set( 1, 2, 1 );
	scene.add( light, new THREE.AmbientLight( 0xb0bec5, 0.1 ) );

	// shadows
	const shadowCam = light.shadow.camera;
	light.castShadow = true;
	light.shadow.mapSize.setScalar( 4096 );
	light.shadow.bias = 1e-5;
	light.shadow.normalBias = 1e-2;

	shadowCam.left = shadowCam.bottom = - 2.5;
	shadowCam.right = shadowCam.top = 2.5;
	shadowCam.updateProjectionMatrix();

	// camera setup
	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 0, 0.65, 2.5 );
	camera.far = 100;
	camera.updateProjectionMatrix();

	// controls
	controls = new OrbitControls( camera, renderer.domElement );

	// floor
	const floor = new THREE.Mesh( new THREE.PlaneBufferGeometry(), new THREE.ShadowMaterial( { color: 0xffffff, opacity: 0.05 } ) );
	floor.rotation.x = - Math.PI / 2;
	floor.scale.setScalar( 10 );
	floor.position.y = - 0.5;
	floor.receiveShadow = true;
	scene.add( floor );

	const gltf = await new GLTFLoader()
		.setMeshoptDecoder( MeshoptDecoder )
		.loadAsync( 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/stanford-bunny/bunny.glb' );

	const geometry = gltf.scene.children[ 0 ].geometry;
	geometry.computeVertexNormals();

	// initialize brushes
	bunnyBrush = new Brush( gltf.scene.children[ 0 ].geometry, new THREE.MeshStandardMaterial() );
	bunnyBrush.position.y = - 0.5;
	bunnyBrush.updateMatrixWorld();

	material = new THREE.MeshStandardMaterial();
	brushes = [];

	surfaceSampler = new MeshSurfaceSampler( bunnyBrush );
	surfaceSampler.build();

	for ( let i = 0; i < 50; i ++ ) {

		const b = new Brush( new THREE.SphereBufferGeometry( 1, 15, 15 ), material );
		b.receiveShadow = true;
		scene.add( b );
		brushes.push( b );

	}

	// initialize materials
	bunnyBrush.material.opacity = 0.15;
	bunnyBrush.material.transparent = true;
	bunnyBrush.material.depthWrite = false;
	bunnyBrush.material.polygonOffset = true;
	bunnyBrush.material.polygonOffsetFactor = 0.1;
	bunnyBrush.material.polygonOffsetUnits = 0.1;
	bunnyBrush.material.side = THREE.DoubleSide;
	bunnyBrush.material.premultipliedAlpha = true;

	material.opacity = 0.15;
	material.transparent = true;
	material.depthWrite = false;
	material.polygonOffset = true;
	material.polygonOffsetFactor = 0.1;
	material.polygonOffsetUnits = 0.1;
	material.side = THREE.DoubleSide;
	material.premultipliedAlpha = true;
	material.roughness = 0.25;
	material.color.set( 0xE91E63 ).convertSRGBToLinear();

	bunnyBrush.receiveShadow = true;

	scene.add( bunnyBrush );

	// add object displaying the result
	resultObject = new THREE.Mesh( new THREE.BufferGeometry(), new THREE.MeshStandardMaterial( {
		roughness: 0.1,
		flatShading: false,
		polygonOffset: true,
		polygonOffsetUnits: 1,
		polygonOffsetFactor: 1,
	} ) );
	resultObject.castShadow = true;
	resultObject.receiveShadow = true;
	scene.add( resultObject );

	// add wireframe representation
	wireframeResult = new THREE.Mesh( resultObject.geometry, new THREE.MeshBasicMaterial( {
		wireframe: true,
		color: 0,
		opacity: 0.15,
		transparent: true,
	} ) );
	scene.add( wireframeResult );

	// helpers
	edgesHelper = new EdgesHelper();
	edgesHelper.color.set( 0xE91E63 ).convertSRGBToLinear();
	scene.add( edgesHelper );

	trisHelper = new TriangleSetHelper();
	trisHelper.color.set( 0x00BCD4 ).convertSRGBToLinear();
	scene.add( trisHelper );

	// gui
	gui = new GUI();
	gui.add( params, 'operation', { ADDITION, SUBTRACTION, INTERSECTION, DIFFERENCE } ).onChange( () => {

		updateCSG();

	} );
	gui.add( params, 'displayBrushes' );
	gui.add( params, 'shadows' );
	gui.add( params, 'wireframe' );
	gui.add( params, 'randomize' );

	window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );

	randomizeBrushes();
	updateCSG();
	render();

}

function updateCSG() {

	const startTime = window.performance.now();
	let finalBrush = brushes[ 0 ];
	for ( let i = 1, l = brushes.length; i < l; i ++ ) {

		const b = brushes[ i ];
		finalBrush = new Brush( csgEvaluator.evaluate( finalBrush, b, ADDITION ) );

	}

	csgEvaluator.evaluate( bunnyBrush, finalBrush, params.operation, resultObject.geometry );

	const deltaTime = window.performance.now() - startTime;
	outputContainer.innerText = `${ deltaTime.toFixed( 3 ) }ms`;

}

function randomizeBrushes() {

	for ( let i = 0; i < brushes.length; i ++ ) {

		const b = brushes[ i ];
		surfaceSampler.sample( b.position );
		b.position.applyMatrix4( bunnyBrush.matrixWorld );
		b.scale.setScalar( THREE.MathUtils.lerp( 0.1, 0.2, Math.random() ) );
		b.updateMatrixWorld();

	}

}

function render() {

	requestAnimationFrame( render );

	const enableDebugTelemetry = params.enableDebugTelemetry;

	wireframeResult.visible = params.wireframe;
	bunnyBrush.visible = params.displayBrushes;
	brushes.forEach( b => b.visible = params.displayBrushes );


	light.castShadow = params.shadows;

	edgesHelper.visible = enableDebugTelemetry && params.displayIntersectionEdges;
	trisHelper.visible = enableDebugTelemetry && params.displayTriangleIntersections;

	renderer.render( scene, camera );

}



