import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'; // or "const mapboxgl = require('mapbox-gl');"
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import * as turf from '@turf/turf'
import $, { map } from 'jquery';
import logo from '../assets/logo.svg'

// @ts-ignore
// eslint-disable-next-line import/no-webpack-loader-syntax
mapboxgl.workerClass = require('worker-loader!mapbox-gl/dist/mapbox-gl-csp-worker').default;
// Change this to set the app to your location 
// This value is used for the map center, the search proximity bias, and the store location
function TSPGeoCalc() {
    const [storeLocation, setStoreLocation] = useState([0, 0]);
    const [mapState, setMapState] = useState(null);
    const [geocoderState, setGeoCoderState] = useState(null);
    mapboxgl.accessToken = process.env.REACT_APP_MAP_API_KEY;
    let mapContainer = useRef(null)
    let mapGl = useRef(null);
    const transformRequest = (url) => {
        const hasQuery = url.indexOf("?") !== -1;
        const suffix = hasQuery ? "&pluginName=lunchboxOptimization" : "?pluginName=lunchboxOptimization";
        return {
            url: url + suffix
        }
    }
    // This object will hold all the delivery stops, starting with the store location
    let orders = {
        type: "FeatureCollection",
        features: [{
            type: 'Feature',
            properties: {
                address: 'Home',
                accepted: 'home',
            },
            geometry: {
                type: 'Point',
                coordinates: [],//storeLocation
            }
        }
        ]
    };
    let iso = {};
    // UI elements
    // Note the parameters to exclude animation and markers, and to set the proximity bias
    // Proximity bias helps the API return more relevant local results
    const setOverview = function (route) {
        const trip = route.trips[0];
        const waypoints = route.waypoints;
        // Set some basic stats for the route in the sidebar
        document.getElementById('stops').innerText = `${route.waypoints.length.toFixed(0)}`;
        document.getElementById('distance').innerText = `${(trip.distance / 1609.344).toFixed(1)}`;
        document.getElementById('duration').innerText = `${(trip.duration / 60).toFixed(0)}`;
        document.getElementById('divDirectionsRoute').innerText = '';

        // Add the delivery addresses and turn-by-turn instructions to the sidebar for each leg of the trip
        trip.legs.forEach((leg, i) => {
            let directionDiv = document.createElement('div');
            directionDiv.id = 'divTrip_' + i
            let directionHeader = document.createElement('h1');
            let directionUl = document.createElement('ul');
            directionUl.id = 'ulTrip_' + i
            // We want the destination address when we depart, hence index + 1
            if (i < trip.legs.length - 1) {
                const nextDelivery = waypoints.find(({ waypoint_index }) => waypoint_index === i + 1);
                directionHeader.innerHTML = `Delivery to ${nextDelivery.address}`;
            } else {
                // We're outside the range of deliveries, so let's go home
                directionHeader.innerHTML = `Return Home`;
            }
            document.getElementById('divDirectionsRoute').appendChild(directionDiv);
            document.getElementById(directionDiv.id).appendChild(directionHeader);
            document.getElementById(directionDiv.id).appendChild(directionUl);
            // add the TBT instructions for this leg
            leg.steps.forEach((step) => {
                let directionStep = document.createElement('li');
                directionStep.innerText = step.maneuver.instruction;
                document.getElementById(directionUl.id).appendChild(directionStep);
            });
        });
    }
    const setTripLine = function (trip) {
        const routeLine = {
            type: 'FeatureCollection',
            features: [{
                properties: {},
                geometry: trip.geometry,
            }],
        };

        mapGl.current.getSource('route').setData(routeLine);
    }
    const setStops = function (stops) {
        const deliveries = {
            type: 'FeatureCollection',
            features: [
            ],
        };

        stops.forEach((stop) => {
            const delivery = {
                properties: {
                    name: stop.address,
                    stop_number: stop.waypoint_index
                },
                geometry: {
                    type: 'Point',
                    coordinates: stop.location,
                },
            };
            deliveries.features.push(delivery);
        });
        mapGl.current.getSource('deliveries').setData(deliveries);
    }
    const getDeliveryRoute = function () {
        // Filter out only the orders that have been accepted
        if (orders.features.length > 12) {
            let lastItem = orders.features[orders.features.length - 1]
            orders.features[11] = lastItem;
            orders.features.length = 12
            setAlert("trips", orders);
        }
        const deliverable = orders.features.filter(point => point.properties.accepted);
        // Once there are 2 deliveries, get the delivery route
        if (deliverable.length > 1) {
            const coords = [];
            deliverable.forEach((delivery) => {
                coords.push(delivery.geometry.coordinates.join(','));
            });
            const approachParam = ';curb';
            let optimizeUrl = 'https://api.mapbox.com/optimized-trips/v1/';
            optimizeUrl += 'mapbox/driving-traffic/';
            optimizeUrl += coords.join(';');
            optimizeUrl += '?access_token=' + mapboxgl.accessToken;
            optimizeUrl += '&geometries=geojson&overview=full&steps=true';
            optimizeUrl += '&approaches=' + approachParam.repeat(coords.length - 1);

            fetch(optimizeUrl).then((res) => res.json()).then((res) => {
                // Add the original address text to the waypoints
                res.waypoints.forEach((waypoint, i) => {
                    waypoint.address = waypoint[i] === 0 ? 'Start' : deliverable[i].properties.address;
                });

                // Add the distance, duration, and turn-by-turn instructions to the sidebar
                setOverview(res);

                // Draw the route and stops on the map
                setTripLine(res.trips[0]);
                setStops(res.waypoints);
            });
        };
    };
    const checkAddressInServiceArea = function (address) {
        if (address) {
            // Save the address text from the response
            const addressText = address.place_name;

            const order = {
                type: 'Feature',
                properties: {
                    address: addressText,
                },
                geometry: {
                    type: 'Point',
                    coordinates: address.geometry.coordinates
                }
            };

            // Returns true if the point is in the isochrone
            const status = turf.booleanPointInPolygon(order, iso.features[0]);
            if (status === false) setAlert('bounds');
            order.properties.accepted = status;

            // All orders get added to the map, where they are colored by accepted status
            orders.features.push(order);
            mapGl.current.getSource('orders').setData(orders);
            getDeliveryRoute();
        }
    };
    const getIso = function (coords) {
        if (mapGl.current !== null) {
            let isoUrl = 'https://api.mapbox.com/isochrone/v1/mapbox/driving/' + coords.join(',') + '.json';
            isoUrl += '?contours_minutes=30&polygons=true&access_token=' + mapboxgl.accessToken;
            fetch(isoUrl).then(res => res.json()).then(res => {
                iso = res;
                mapGl.current.getSource("iso").setData(iso);
                return iso;
            });
        }
    };
    const getCurrentLocation = async () => {
        return new Promise((resolve, reject) => {
            if (navigator.geolocation) {
                let currentLoc = navigator.geolocation.getCurrentPosition(function (position) {
                    setStoreLocation([position.coords.longitude, position.coords.latitude])
                    resolve([position.coords.longitude, position.coords.latitude])
                }, (err) => {
                    console.log(err);
                    setStoreLocation([-118.2437, 34.0522])
                    resolve([-118.2437, 34.0522]);
                }, { timeout: 10000, enableHighAccuracy: true });
            }
            else {
                setStoreLocation([-118.2437, 34.0522])
                resolve([-118.2437, 34.0522]);
            }
        });
    };
    function getReverseGeocode(feature) {
        var lat = feature.lngLat.lat;
        var lng = feature.lngLat.lng;
        var url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + lng + "%2C" + lat + ".json?access_token=" + mapboxgl.accessToken; //"https://api.mapbox.com/geocoding/v5/mapbox.places/" + lat + "," + lng + ".json?access_token=" + mapboxgl.accessToken + "&autocomplete=true&types=address";
        fetch(url)
            .then(res => res.json())
            .then(res => {
                checkAddressInServiceArea(res.features[0], mapGl.current)
            });
    }
    function setAlert(state, o) {
        if (state === "home") {
            $('.homeInfo').addClass('modalEnter');
        }
        if (state === "trips") {
            $('.maxRouteLimit').addClass('modalEnter');

        }
        if (state === "bounds") {
            $('.outsideBounds').addClass('modalEnter');
        }
    }
    function addDelieverySources_Layers(map) {
        map.addSource('route', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                ],
            },
        });

        map.addLayer({
            id: 'routeLayer',
            type: 'line',
            source: 'route',
            layout: {},
            paint: {
                'line-color': '#E9E9E9',
                'line-width': 6,
                "line-opacity": 0.4,
            },
        }, 'road-label-navigation');

        map.addLayer({
            id: 'routeArrows',
            source: 'route',
            type: 'symbol',
            layout: {
                'symbol-placement': 'line',
                'text-field': '→',
                'text-rotate': 0,
                'text-keep-upright': false,
                'symbol-spacing': 30,
                'text-size': 15,
                'text-offset': [0, -0.1],
            },
            paint: {
                'text-color': 'white',
                'text-halo-color': 'white',
                'text-halo-width': 1,
            },
        }, 'road-label-navigation');

        map.addSource("deliveries", {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [
                ]
            }
        });

        map.addSource("orders", {
            type: "geojson",
            data: orders
        });

        map.addLayer({
            "id": "ordersLayer",
            "type": "circle",
            "source": "orders",
            "layout": {},
            "paint": {
                "circle-radius": 5,
                "circle-opacity": 0.7,
                "circle-color": [
                    'case',
                    ['==', ['get', 'accepted'], true],
                    'white',
                    ['==', ['get', 'accepted'], 'home'],
                    'green',
                    'red'
                ],
                "circle-stroke-color": "white",
                "circle-stroke-width": 2,
                "circle-stroke-opacity": 0.2
            }
        }, "road-label-navigation");

        map.addLayer({
            "id": "deliveriesLayer",
            "type": "circle",
            "source": "deliveries",
            "layout": {},
            "paint": {
                "circle-color": 'white',
                "circle-stroke-color": '#444',
                "circle-radius": 13
            }
        }, "road-label-navigation");

        map.addLayer({
            "id": "deliveriesLabels",
            "type": "symbol",
            "source": "deliveries",
            "layout": {
                'text-field': ['get', 'stop_number']
            },
            "paint": {
                "text-color": '#444'
            }
        });
    }
    function initializeMap(setMapState, mapContainer) {
        let radius = 5;
        let opacity = 0.1;
        const map = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mrpurple/ckkklxrzx1j0r17o9n1p0bknn?optimize=true',
            transformRequest: transformRequest,
            maxPitch: 70,
        });
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            flyTo: true,
            marker: true,
            proximity: storeLocation,
        });
        map.on('click', e => {
            getReverseGeocode(e)
            map.setMinZoom(8);
        })
        map.on("load", () => {
            map.addSource("iso", {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [
                    ]
                }
            });

            map.addLayer({
                "id": "isoLayer",
                "type": "fill",
                "source": "iso",
                "layout": {},
                "paint": {
                    "fill-color": "purple",
                    "fill-opacity": 0,
                }
            }, "road-label-navigation");
            addDelieverySources_Layers(map)
            setInterval(() => {
                map.setPaintProperty('ordersLayer', 'circle-stroke-width', radius);
                radius = ++radius % 5;
                map.setPaintProperty('ordersLayer', 'circle-stroke-opacity', opacity);
                opacity = (++opacity + 0.6) % 1
            }, 150);
            // Do this when the geocoder returns a result
            geocoder.on("result", ev => {
                map.fire('click', { lngLat: { lng: ev.result.geometry.coordinates[0], lat: ev.result.geometry.coordinates[1] } })
            });
            getCurrentLocation().then(res => {
                map.flyTo({
                    center: res, zoom: 13, pitch: 65,
                    easing: function (t) {
                        return t;
                    },
                    essential: true
                })
                orders.features[0].geometry.coordinates = res
                getIso(res);
                setMapState(map);
                map.getSource('orders').setData(orders)
                setGeoCoderState(geocoder);
                $('#geoSearch').append(geocoder.onAdd(mapState));
                setAlert('home');
            })
        });
        return { map: map, geocoder: geocoder }
    }
    useEffect(() => {
        if (!mapState) {
            let obj = initializeMap(setMapState, mapContainer);
            mapGl.current = obj.map;
        }
    }, [])
    return (
        <div className="parentMapContainer" >
            <div className="map-overlay-container">
                <div className="map-overlay">
                    <div className="overlayHeader">
                        <div id="divLogo" className="logoContainer headerContent">
                            <img src={logo} alt='logo' />
                            <h1>Quantum Salesman</h1>
                        </div>
                        <p className="instructions">Click on a location on the map or search for an address to begin planning your delivery route.</p>
                    </div>
                    <div id="geoSearch"></div>
                    <div id="divRouteContent" className="routeContent">
                        <div id="overviewContent" className="overviewTextBox">
                            <div>
                                <h1 id="stops">0</h1>
                                <p>Stops</p>
                            </div>
                            <div>
                                <h1 id="duration">0</h1>
                                <p>Minutes</p>
                            </div>
                            <div>
                                <h1 id="distance">0</h1>
                                <p>Miles</p>
                            </div>
                        </div>
                        <div id="divDirectionsRoute" className="routeDetails">
                        </div>
                    </div>
                </div>
            </div>
            <div id="divAlerts" className='alertsContainer'>
                <div className="modal homeInfo">
                    <h1>The default starting point is your current location, and the route will plan a round trip back to your original position.</h1>
                    <i onClick={() => $('.homeInfo').removeClass('modalEnter')} className="far fa-times-circle"></i>
                </div>
                <div className="modal maxRouteLimit">
                    <h1>You can only plan out a route of 12 stops at a time. Refresh the page to replan out your delivery route.</h1>
                    {/* <button onClick={() => {resetRoute()}}>Reset Delivery Route</button> */}
                    <i onClick={() => $('.maxRouteLimit').removeClass('modalEnter')} className="far fa-times-circle"></i>
                </div>
                <div className="modal outsideBounds">
                    <h1>You've selected a location that is out of bounds. We do this to optimize the algorithm and ensure quicker load speeds. Try a closer location.</h1>
                    <i onClick={() => $('.outsideBounds').removeClass('modalEnter')} className="far fa-times-circle"></i>
                </div>
            </div>
            <div id='divMap' ref={el => mapContainer = el} className='mapContainer' />
            <pre id="coordinates" className="coordinates"></pre>
            <div id="divDirections" className="directionsContainer"></div>
        </div>
    );
}

export default TSPGeoCalc