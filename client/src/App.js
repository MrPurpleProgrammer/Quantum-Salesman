import './App.css';
import Map from './components/Map'

function App() {
  return (
    <div id="divContainer">
      <div id="divHeader" className="parentHeaderContainer">
        <div className="headerContainer">
          <div id="divLogo" className="logoContainer headerContent">
            <i className="fas fa-atom"></i>
            <h1>Quantum Salesman</h1>
          </div>
          <h1 className="headeContent">Home</h1>
        </div>
      </div>
      <div id="divContent">
        <Map />
      </div>
      <div id="divFooter">

      </div>
    </div>
  )
}

export default App;
