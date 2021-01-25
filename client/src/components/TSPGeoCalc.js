import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'; // or "const mapboxgl = require('mapbox-gl');"
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import * as turf from '@turf/turf'
import { map } from 'jquery';
// Change this to set the app to your location 
// This value is used for the map center, the search proximity bias, and the store location
function TSPGeoCalc() {
    const [addressList, setAddress] = useState(document.getElementById('addresses'))
    const [titleText, setTitle] = useState(document.getElementById('title'))
    const mapContainer = useRef('')
    const [storeLocation, setStoreLocation] = useState([0, 0]);
    const [mapState, setMapState] = useState(null);
    mapboxgl.accessToken = process.env.REACT_APP_MAP_API_KEY;
    const transformRequest = (url) => {
        const hasQuery = url.indexOf("?") !== -1;
        const suffix = hasQuery ? "&pluginName=lunchboxOptimization" : "?pluginName=lunchboxOptimization";
        return {
            url: url + suffix
        }
    }
    // This object will hold all the delivery stops, starting with the store location
    const orders = {
        type: "FeatureCollection",
        features: [{
            type: 'Feature',
            properties: {
                address: 'Home',
                accepted: 'home'
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
        titleText.innerText = `${(trip.distance / 1609.344).toFixed(1)} miles | ${(trip.duration / 60).toFixed(0)} minutes`;
        addressList.innerText = '';

        // Add the delivery addresses and turn-by-turn instructions to the sidebar for each leg of the trip
        trip.legs.forEach((leg, i) => {
            const listItem = document.createElement('li');
            // We want the destination address when we depart, hence index + 1
            if (i < trip.legs.length - 1) {
                const nextDelivery = waypoints.find(({ waypoint_index }) => waypoint_index === i + 1);
                console.log(nextDelivery);
                listItem.innerHTML = `<b>Deliver to: ${nextDelivery.address}</b>`;
            } else {
                // We're outside the range of deliveries, so let's go home
                listItem.innerHTML = `<b>Return to store</b>`;
            }
            addressList.appendChild(listItem);
            // add the TBT instructions for this leg
            leg.steps.forEach((step) => {
                const listItem = document.createElement('li');
                listItem.innerText = step.maneuver.instruction;
                addressList.appendChild(listItem);
            });
        });
    }
    const setTripLine = function (trip, _map) {
        const routeLine = {
            type: 'FeatureCollection',
            features: [{
                properties: {},
                geometry: trip.geometry,
            }],
        };

        _map.getSource('route').setData(routeLine);
    }
    const setStops = function (stops, _map) {
        const deliveries = {
            type: 'FeatureCollection',
            features: [
            ],
        };

        stops.forEach((stop) => {
            const delivery = {
                properties: {
                    name: stop.name,
                    stop_number: stop.waypoint_index
                },
                geometry: {
                    type: 'Point',
                    coordinates: stop.location,
                },
            };
            deliveries.features.push(delivery);
        });
        _map.getSource('deliveries').setData(deliveries);
    }
    const getDeliveryRoute = function (_map) {
        // Filter out only the orders that have been accepted
        const deliverable = orders.features.filter(point => point.properties.accepted);

        // Once there are 5 deliveries, get the delivery route
        if (deliverable.length > 1) {
            const coords = [];

            deliverable.forEach((delivery) => {
                coords.push(delivery.geometry.coordinates.join(','));
            });
            if (coords.length > 12) return alert("ERROR: Max Trips 12, Remove a Trip to add a new one.")
            else {
                const approachParam = ';curb';
                let optimizeUrl = 'https://api.mapbox.com/optimized-trips/v1/';
                optimizeUrl += 'mapbox/driving-traffic/';
                optimizeUrl += coords.join(';');
                optimizeUrl += '?access_token=' + mapboxgl.accessToken;
                optimizeUrl += '&geometries=geojson&overview=full&steps=true';
                optimizeUrl += '&approaches=' + approachParam.repeat(coords.length - 1);

                // To inspect the response in the browser, remove for production
                console.log(optimizeUrl);

                fetch(optimizeUrl).then((res) => res.json()).then((res) => {
                    // Add the original address text to the waypoints
                    res.waypoints.forEach((waypoint, i) => {
                        waypoint.address = waypoint[i] == 0 ? 'Start' : deliverable[i].properties.address;
                    });

                    // Add the distance, duration, and turn-by-turn instructions to the sidebar
                    setOverview(res);

                    // Draw the route and stops on the map
                    setTripLine(res.trips[0], _map);
                    setStops(res.waypoints, _map);
                });
            }
        };
    };
    const checkAddressInServiceArea = function (address, _map) {
        console.log(addressList, address, _map);
        // Save the address text from the response
        const addressText = address.address ? address.address + ' ' + address.text : address.text;

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
        order.properties.accepted = status;

        // If the point is inside, the order is accepted, so add it to the sidebar
        if (status) {
            const listItem = document.createElement('li');
            listItem.innerText = order.properties.address;
            addressList.appendChild(listItem);
        }

        // All orders get added to the map, where they are colored by accepted status
        orders.features.push(order);
        _map.getSource('orders').setData(orders);
        getDeliveryRoute(_map);
    };
    const getIso = function (coords, _map) {
        if (_map !== null) {
            let isoUrl = 'https://api.mapbox.com/isochrone/v1/mapbox/driving/' + coords.join(',') + '.json';
            isoUrl += '?contours_minutes=10&polygons=true&access_token=' + mapboxgl.accessToken;
            fetch(isoUrl).then(res => res.json()).then(res => {
                iso = res;
                _map.getSource("iso").setData(iso);
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
                });
            }
            else {
                setStoreLocation([-118.4017, 34.0282])
                resolve([-118.4017, 34.0282]);
            }
        });
    };
    function getReverseGeocode(feature, _map) {
        var lat = feature.lngLat.lat;
        var lng = feature.lngLat.lng;
        var url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + lng + "%2C" + lat + ".json?access_token=" + mapboxgl.accessToken + "&autocomplete=true&types=address"; //"https://api.mapbox.com/geocoding/v5/mapbox.places/" + lat + "," + lng + ".json?access_token=" + mapboxgl.accessToken + "&autocomplete=true&types=address";
        fetch(url)
            .then(res => res.json())
            .then(res => {
                console.log(res);
                checkAddressInServiceArea(res.features[0], _map)
            });
    }
    useEffect(() => {
        setTitle(document.getElementById('title'));
        setAddress(document.getElementById('addresses'));
    }, [])
    // useEffect(() => {
    //     getIso(mapState)
    // }, [storeLocation])
    // useEffect(() => {
    // }, [storeLocation])
    useEffect(() => {
        const map = new mapboxgl.Map({
            container: 'divMap',
            style: 'mapbox://styles/mrpurple/ckk7m6lbo00mt18rubqh7ejlu', //mapbox://styles/mrpurple/ckjrpxuxd23s419l9qlhkpo96',
            transformRequest: transformRequest
        });
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            flyTo: false,
            marker: false,
            proximity: storeLocation,
            reverseGeocode: true
        });
        map.addControl(geocoder, "top-right");
        map.on('click', e => {
            getReverseGeocode(e, map)
            console.log(e);
        })
        map.on('move', () => {
            setStoreLocation(map.getCenter());
            // access longitude and latitude values directly
            console.log({
                center: map.getCenter(),
                zoom: map.getZoom().toFixed(2),
                bearing: map.getBearing(),
            });
        });
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
                    "fill-opacity": 0.3
                }
            }, "road-label");

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
                    'line-color': 'cornflowerblue',
                    'line-width': 10,
                },
            }, 'road-label');

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
                    'text-size': 22,
                    'text-offset': [0, -0.1],
                },
                paint: {
                    'text-color': 'white',
                    'text-halo-color': 'white',
                    'text-halo-width': 1,
                },
            }, 'road-label');

            map.addSource("deliveries", {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [
                    ]
                }
            });
            map.addLayer(
                {
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',

                        // use an 'interpolate' expression to add a smooth transition effect to the
                        // buildings as the user zooms in
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                },
            );
            // Do this when the geocoder returns a result
            geocoder.on("result", ev => {
                checkAddressInServiceArea(ev.result, map);
            });
            let center = getCurrentLocation().then(res => {
                map.flyTo({ center: res, zoom: 11 })
                orders.features[0].geometry.coordinates = res
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
                        "circle-radius": 7,
                        "circle-color": [
                            'case',
                            ['get', 'accepted'],
                            'blue',
                            ['==', ['get', 'accepted'], 'home'],
                            'black',
                            'red'
                        ]
                    }
                }, "road-label");

                map.addLayer({
                    "id": "deliveriesLayer",
                    "type": "circle",
                    "source": "deliveries",
                    "layout": {},
                    "paint": {
                        "circle-color": 'white',
                        "circle-stroke-color": '#444',
                        "circle-radius": 18
                    }
                }, "road-label");

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
                getIso(res, map);
                setMapState(map);
            })
        });
    }, [addressList, titleText])
    return (
        <div className="parentMapContainer" >
            <div className="map-overlay-container">
                <div className="map-overlay">
                    <h2 id="title">Accepted orders</h2>
                    <ul id="addresses"></ul>
                </div>
            </div>
            <div id='divMap' ref={mapContainer} className='mapContainer' />
            <pre id="coordinates" className="coordinates"></pre>
            <div id="divDirections" className="directionsContainer"></div>
        </div>
    );
}

export default TSPGeoCalc