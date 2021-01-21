import $ from 'jquery'
import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'; // or "const mapboxgl = require('mapbox-gl');"
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions'
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css'

mapboxgl.accessToken = 'pk.eyJ1IjoibXJwdXJwbGUiLCJhIjoiY2tqcnA4NWs1MXRzdzJ4bGV3eHFuemx1cSJ9.R1GOV--AHq_E-pN8xd9NcA';

function Map() {
    const mapContainer = useRef('')
    const [map, setMap] = useState(null)
    // create a function to make a directions request
    function getRoute(end, map) {
        // make a directions request using cycling profile
        // an arbitrary start will always be the same
        // only the end or destination will change
        var start = [-122.662323, 45.523751];
        var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' + start[0] + ',' + start[1] + ';' + end[0] + ',' + end[1] + '?steps=true&geometries=geojson&access_token=' + mapboxgl.accessToken;

        // make an XHR request https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
        var req = new XMLHttpRequest();
        req.open('GET', url, true);
        req.onload = function () {
            var json = JSON.parse(req.response);
            var data = json.routes[0];
            var route = data.geometry.coordinates;
            var geojson = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: route
                }
            };
            // if the route already exists on the map, reset it using setData
            if (map.getSource('route')) {
                map.getSource('route').setData(geojson);
            } 
            else { // otherwise, make a new request
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates: geojson
                            }
                        }
                    },
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#3887be',
                        'line-width': 5,
                        'line-opacity': 0.75
                    }
                });
            }
            // add turn instructions here at the end
        };
        req.send();
    }
    let createMapObj = (start) => {
        const _map = new mapboxgl.Map({
            container: 'divMap',
            style: 'mapbox://styles/mrpurple/ckjrpxuxd23s419l9qlhkpo96',
            center: [-74.5, 40], // starting position [lng, lat]
            zoom: 9 // starting zoom
        });
        var nav = new mapboxgl.NavigationControl();
        _map.addControl(nav, 'bottom-left');
        // Creates new directions control instance
        const directions = new MapboxDirections({
            container: 'divDirections',
            accessToken: mapboxgl.accessToken,
            unit: 'metric',
            profile: 'mapbox/driving',
        });
        // Integrates directions control with map
        _map.addControl(directions, 'top-left');
        var marker = new mapboxgl.Marker({ draggable: true }).setLngLat([0, 0]).addTo(_map);
        var coordinates = document.getElementById('coordinates');
        function onDragEnd() {
            var lngLat = marker.getLngLat();
            coordinates.style.display = 'block';
            coordinates.innerHTML =
                'Longitude: ' + lngLat.lng + '<br />Latitude: ' + lngLat.lat;
        }
        marker.on('dragend', onDragEnd);
        _map.on('move', () => {
            // access longitude and latitude values directly
            console.log({
                lng: _map.getCenter().lng.toFixed(4),
                lat: _map.getCenter().lat.toFixed(4),
                zoom: _map.getZoom().toFixed(2),
                bearing: _map.getBearing(),
            });
        });
        _map.on('load', function () {
            // make an initial directions request that
            // starts and ends at the same location
            getRoute(start, _map);
            // Add starting point to the map
            _map.addLayer({
                id: 'point',
                type: 'circle',
                source: {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'Point',
                                coordinates: start
                            }
                        }
                        ]
                    }
                },
                paint: {
                    'circle-radius': 10,
                    'circle-color': '#3887be'
                }
            });
            // this is where the code from the next step will go
        });
        _map.on('click', function (e) {
            var coordsObj = e.lngLat;
            var coords = Object.keys(coordsObj).map(function (key) {
                return coordsObj[key];
            });
            var end = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'Point',
                        coordinates: coords
                    }
                }
                ]
            };
            if (_map.getLayer('end')) {
                _map.getSource('end').setData(end);
            } else {
                _map.addLayer({
                    id: 'end',
                    type: 'circle',
                    source: {
                        type: 'geojson',
                        data: {
                            type: 'FeatureCollection',
                            features: [{
                                type: 'Feature',
                                properties: {},
                                geometry: {
                                    type: 'Point',
                                    coordinates: coords
                                }
                            }]
                        }
                    },
                    paint: {
                        'circle-radius': 10,
                        'circle-color': '#f30'
                    }
                });
            }
            getRoute(coords, _map);
        });
        _map.resize();
        setMap(_map);
        return _map;
    }
    useEffect(() => {
        let start = [-122.477738, 43.562458]
        createMapObj(start);
    }, [])
    return (
        <div className="parentMapContainer" >
            <div id='divMap' ref={mapContainer} className='mapContainer' />
            <pre id="coordinates" class="coordinates"></pre>
            <div id="divDirections" className="directionsContainer"></div>
        </div>
    );
}

export default Map