import React, { useState, useEffect } from 'react';
import { 
  Satellite, Layers, Settings, User, Image as ImageIcon, Camera,
  UploadCloud, Download, RotateCcw, Activity, Map as MapIcon, ChevronDown, Loader2, Navigation, Plus, Minus, Home, Search
} from 'lucide-react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { upscaleImage, extractLiveTile } from './api';


function MapFlyTo({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.flyTo(location, 19, { duration: 7.0, easeLinearity: 0.1 });
    }
  }, [location, map]);
  return null;
}

// Hook to track the map center coordinates and viewport bounding box
function MapCenterTracker({ setCenter, setBounds }) {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      setCenter([center.lat, center.lng]);
      
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setBounds([sw.lng, sw.lat, ne.lng, ne.lat]);
    }
  });
  
  useEffect(() => {
    // Initialize bounds on first load
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    setBounds([sw.lng, sw.lat, ne.lng, ne.lat]);
  }, [map, setBounds]);

  return null;
}

function SRMStudio({ initialTab = "map", onBack, onHome }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [error, setError] = useState(null);
  
  
  // Map State
  const [viewportCenter, setViewportCenter] = useState([40.7128, -74.0060]); // Start in New York for grand fly-in
  const [mapBounds, setMapBounds] = useState(null);

  // Locate Me state
  const [mapRef, setMapRef] = useState(null);
  const [flyToLocation, setFlyToLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setFlyToLocation([parseFloat(lat), parseFloat(lon)]);
      } else {
        setError("Location not found.");
      }
    } catch (_err) {
      setError("Search failed.");
    }
    setIsSearching(false);
  };


  const handleLocateMe = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setIsLocating(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFlyToLocation([latitude, longitude]);
        setIsLocating(false);
      },
      (_err) => {
        setError("Location access denied. Please enable location permissions in your browser.");
        setIsLocating(false);
      },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
      if (initialTab === 'map') {
        handleLocateMe();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTab]);

// Upload State
  const [file, setFile] = useState(null);
  const [originalPreview, setOriginalPreview] = useState(null);
  
  // Execution State
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [sliderPos, setSliderPos] = useState(50);

    const handleFileUpload = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setOriginalPreview(URL.createObjectURL(selected));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      setOriginalPreview(URL.createObjectURL(selected));
    }
  };

const executePipeline = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      let data;
      if (activeTab === 'upload') {
        if (!file) throw new Error("Please upload a file.");
        setLoadingStage('Enhancing...');
        data = await upscaleImage(file);
      } else if (activeTab === 'map') {
        if (!mapBounds) throw new Error("Map bounds not initialized.");
        setLoadingStage('Extracting & Enhancing...');
        
        data = await extractLiveTile(mapBounds);
      }
      
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setLoadingStage('');
    }
  };

  const resetWorkspace = () => {
    setResult(null);
    setFile(null);
    setOriginalPreview(null);
    setSliderPos(50);
  };

  const handleDownloadGeoTIFF = (e) => {
    e.preventDefault();
    if (!result || !result.download_url) return;
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const downloadUrl = `${apiUrl}${result.download_url}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.target = '_blank';
    a.download = result.download_url.split('/').pop() || 'enhanced_image.tif';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadImage = (e) => {
    e.preventDefault();
    if (!result || !result.preview_base64) return;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = result.preview_base64;
    a.download = 'enhanced_satellite.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-screen bg-black/80 backdrop-blur-3xl text-zinc-300 font-sans overflow-hidden">
      
      {/* Left Navigation Bar */}
      <div className="w-16 bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-4 justify-between z-20">
          <div className="flex flex-col gap-6">
            <div onClick={onHome} className="p-2 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-lg cursor-pointer transition-colors" title="Go Home">
              <Home size={24} />
            </div>
            <div onClick={onBack} className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors" title="Back to Selection">
              <Satellite size={24} />
            </div>
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors">
            <Layers size={24} />
          </div>
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors">
            <Settings size={24} />
          </div>
        </div>
        <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors group relative">
          <User size={24} />
          <span className="absolute left-12 top-1 bg-white/10 hover:bg-white/20 text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
            Elakiyan K.
          </span>
        </div>
      </div>

      {/* Left Control Drawer */}
      <div className="w-80 bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col z-20 ">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-black tracking-tighter text-white">GeoEnhance AI</h1>
        </div>

        <div className="flex border-b border-white/10">
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'map' ? 'text-zinc-200 border-b-2 border-white/60 bg-white/10 hover:bg-white/20/50' : 'text-zinc-500 hover:bg-white/10 hover:bg-white/20/30 transition-colors'}`}
            onClick={() => { setActiveTab('map'); resetWorkspace(); }}
          >
            <MapIcon size={16} /> Live Map
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'upload' ? 'text-zinc-200 border-b-2 border-white/60 bg-white/10 hover:bg-white/20/50' : 'text-zinc-500 hover:bg-white/10 hover:bg-white/20/30 transition-colors'}`}
            onClick={() => { setActiveTab('upload'); resetWorkspace(); }}
          >
            <UploadCloud size={16} /> Upload
          </button>
        </div>

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
          {activeTab === 'map' && (
            <div className="bg-white/10 hover:bg-white/20/50 border border-white/10 rounded-lg p-4">
              <form onSubmit={handleSearch} className="flex gap-2 mb-4 w-full">
                  <input 
                    type="text" 
                    placeholder="Search location..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <button 
                    type="submit" 
                    disabled={isSearching || !searchQuery.trim()}
                    className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-3 py-2 rounded-md transition-colors flex items-center justify-center"
                  >
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  </button>
                </form>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Live Bounding Box</h3>
              {mapBounds ? (
                <div className="flex flex-col gap-1 text-[11px] font-mono text-zinc-500 bg-black/80 backdrop-blur-3xl p-2 rounded">
                  <div className="flex justify-between">
                    <span>Min Lon: {mapBounds[0].toFixed(4)}</span>
                    <span>Min Lat: {mapBounds[1].toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Lon: {mapBounds[2].toFixed(4)}</span>
                    <span>Max Lat: {mapBounds[3].toFixed(4)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Initializing bounds...</div>
              )}
              <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
                Position the viewport over the desired region. The AI will extract the exact bounding box from the Sentinel-2 STAC catalog and apply high-fidelity super resolution.
              </p>
            </div>
          )}

          {activeTab === 'upload' && (
            <div onDragOver={handleDragOver} onDrop={handleDrop} className="bg-white/10 hover:bg-white/20/50 border border-white/10 border-dashed rounded-lg p-6 flex flex-col items-center text-center transition-colors">
              <ImageIcon size={32} className="text-slate-500 mb-2" />
              <p className="text-sm text-zinc-400 font-medium">Drag & Drop File</p>
              <p className="text-xs text-slate-500 mt-1">Accepts .tif, .tiff, .png</p>
              <label className="mt-4 bg-white/10 hover:bg-slate-600 text-white text-xs py-2 px-4 rounded cursor-pointer transition-colors">
                Browse Files
                <input type="file" className="hidden" accept=".tif,.tiff,.png" onChange={handleFileUpload} />
              </label>
              {file && <p className="text-xs text-zinc-200 mt-3 font-mono break-all">{file.name}</p>}
            </div>
          )}

          <div className="flex flex-col gap-4 mt-auto border-t border-white/10 pt-6">
            
            {error && <div className="text-xs text-red-400 bg-red-950/30 p-3 rounded border border-red-900/50 break-words">{error}</div>}

            <button 
              onClick={executePipeline}
              disabled={isProcessing || (activeTab === 'upload' && !file) || result}
              className={`w-full py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                isProcessing || result ? 'bg-white/5 text-zinc-600 cursor-not-allowed' 
                : 'bg-white hover:bg-zinc-200 text-black '
              }`}
            >
              {isProcessing ? (
                <><Loader2 size={16} className="animate-spin" /> Enhancing...</>
              ) : result ? (
                'Enhancement Complete'
              ) : (
                'Enhance'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 relative bg-black/80 backdrop-blur-3xl overflow-hidden flex items-center justify-center">
        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-3xl/80 backdrop-blur-sm flex flex-col items-center justify-center">
            
            {/* Creative Space-Themed Loading Icon */}
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 border-t-2 border-l-2 border-blue-500/80 rounded-full animate-spin [animation-duration:2s]" />
              <div className="absolute inset-2 border-r-2 border-b-2 border-white/50 rounded-full animate-spin [animation-duration:1.5s] [animation-direction:reverse]" />
              <div className="absolute inset-4 border-t-2 border-r-2 border-blue-300/30 rounded-full animate-spin [animation-duration:3s]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Satellite size={28} className="text-white animate-pulse" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-white tracking-wide">{loadingStage}</h2>
            <p className="text-zinc-500 text-sm mt-2">This process may take a few moments...</p>
          </div>
        )}

        {!result ? (
          // Pre-execution View
          <div className="absolute inset-0 z-0">
            {activeTab === 'map' ? (
              <>
                
                  <button 
                    onClick={handleLocateMe}
                    disabled={isLocating}
                    className="absolute top-12 right-12 z-[1000] bg-black/80 hover:bg-zinc-800 text-white p-3 rounded-full  border border-white/20 transition-all flex items-center justify-center group"
                    title="Locate Me"
                  >
                    {isLocating ? <Loader2 size={20} className="animate-spin text-zinc-400" /> : <Navigation size={20} className="text-zinc-200 group-hover:text-white" />}
                  </button>

                  {/* Zoom Controls */}
                  <div className="absolute bottom-12 right-12 z-[1000] flex flex-col  rounded-xl overflow-hidden border border-white/20 bg-black/80 backdrop-blur-md">
                    <button 
                      onClick={() => mapRef?.zoomIn()}
                      className="p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border-b border-white/10 flex items-center justify-center"
                      title="Zoom In"
                    >
                      <Plus size={20} />
                    </button>
                    <button 
                      onClick={() => mapRef?.zoomOut()}
                      className="p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center justify-center"
                      title="Zoom Out"
                    >
                      <Minus size={20} />
                    </button>
                  </div>


                  <MapContainer ref={setMapRef} center={viewportCenter} zoom={4} className="w-full h-full" zoomControl={false}>
                  <TileLayer 
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    attribution="Tiles &copy; Esri"
                  />
                  <MapCenterTracker setCenter={setViewportCenter} setBounds={setMapBounds} />
                    <MapFlyTo location={flyToLocation} />
                </MapContainer>
                
                {/* Visual indicator that the entire visible map viewport is the ROI */}
                <div className="absolute inset-8 border-2 border-white/30/50 z-[1000] pointer-events-none bg-white/5 backdrop-blur-[0.5px]">
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/60 -mt-[3px] -ml-[3px]" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/60 -mt-[3px] -mr-[3px]" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/60 -mb-[3px] -ml-[3px]" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/60 -mb-[3px] -mr-[3px]" />
                  
                  {/* Center Reticle */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-50">
                     <div className="w-8 h-8 border border-white/60 rounded-full"></div>
                     <div className="w-1 h-1 bg-white rounded-full absolute"></div>
                  </div>
                </div>
              </>
            ) : (
                              <div onDragOver={handleDragOver} onDrop={handleDrop} className="w-full h-full flex items-center justify-center p-12 bg-white/[0.02] backdrop-blur-xl border-2 border-dashed border-white/10 hover:border-white/30 transition-colors rounded-2xl">
                {originalPreview ? (
                  <div className="relative max-w-2xl w-full aspect-video">
                     <img src={originalPreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-lg border border-white/10  bg-black/60 backdrop-blur-xl" />
                  </div>
                ) : (
                  <div className="text-zinc-500 flex flex-col items-center">
                      <UploadCloud size={64} className="mb-4 opacity-50 text-white/50" />
                      <p className="text-xl text-zinc-300 font-medium">Drag and drop to upload</p>
                      <p className="text-sm mt-2 mb-6 text-zinc-500">Or click below to browse your files</p>
                      <label className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-3 px-6 rounded-md cursor-pointer transition-colors shadow-lg shadow-white/5">
                        Browse Files
                        <input type="file" className="hidden" accept=".tif,.tiff,.png" onChange={handleFileUpload} />
                      </label>
                    </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Post-execution Split Screen
          <div className="absolute inset-0 z-0 flex items-center justify-center p-12 bg-black/60 backdrop-blur-xl  ">
            <div className="relative w-full max-w-5xl aspect-video rounded-xl overflow-hidden border border-white/10  select-none">
              
              {/* Background (Enhanced) */}
              <img src={result.preview_base64} alt="Enhanced" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/10  z-10 pointer-events-none">
                AI Enhanced (4x)
              </div>

              {/* Foreground (Original) clipped by slider */}
              <div 
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
              >
                <img 
                  src={originalPreview || result.preview_base64} 
                  alt="Original" 
                  className={`absolute inset-0 w-full h-full object-cover opacity-90 brightness-90 ${!originalPreview ? 'blur-[8px]' : 'blur-[2px]'}`} 
                />
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/10  pointer-events-none">
                  Input (Bicubic)
                </div>
              </div>

              {/* Slider Input */}
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={sliderPos}
                onChange={(e) => setSliderPos(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
              />

              {/* Divider Line */}
              <div 
                className="absolute top-0 bottom-0 w-1 bg-white/80  z-10 pointer-events-none transform -translate-x-1/2"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full  flex items-center justify-center text-slate-800">
                  <div className="flex gap-1">
                    <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                    <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                  </div>
                </div>
              </div>

            </div>

            {/* Floating Analysis Card */}
            <div className="absolute bottom-12 right-12 bg-black/90 backdrop-blur-2xl backdrop-blur-md border border-white/10 p-6 rounded-xl  w-[340px] z-30">
              <h3 className="text-white font-bold mb-5 flex items-center gap-2"><Activity size={18} className="text-zinc-200"/> Live Analysis Metrics</h3>
              
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-zinc-500">Peak Signal-to-Noise Ratio (PSNR)</span>
                  <span className="text-zinc-200 font-mono font-bold">{result.psnr.toFixed(2)} dB</span>
                </div>
                <div className="w-full bg-white/10 hover:bg-white/20 rounded-full h-1.5">
                  <div className="bg-zinc-300 h-1.5 rounded-full" style={{ width: `${Math.min((result.psnr / 40) * 100, 100)}%` }}></div>
                </div>
              </div>

              <div className="mb-7">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-zinc-500">Structural Similarity (SSIM)</span>
                  <span className="text-zinc-300 font-mono font-bold">{result.ssim.toFixed(4)}</span>
                </div>
                <div className="w-full bg-white/10 hover:bg-white/20 rounded-full h-1.5">
                  <div className="bg-zinc-300 h-1.5 rounded-full" style={{ width: `${result.ssim * 100}%` }}></div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {(()=>{
                    const isGeoTiffOutput = result?.download_url && result.download_url.toLowerCase().match(/\.tiff?$/);
                    return (
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={(e) => {
                            if (!isGeoTiffOutput) {
                              e.preventDefault();
                              alert("PNG image cannot be converted to GeoTIFF, try uploading GeoTIFF or download the enhanced image in PNG format");
                              return;
                            }
                            handleDownloadGeoTIFF(e);
                          }}
                          className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${isGeoTiffOutput ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-white/10' : 'bg-white/5 border border-white/10 text-zinc-600 cursor-not-allowed'}`}
                        >
                          <Download size={14} /> GeoTIFF
                        </button>
                        <button 
                          onClick={(e) => {
                            if (!isGeoTiffOutput) {
                               handleDownloadGeoTIFF(e);
                            } else {
                               handleDownloadImage(e);
                            }
                          }}
                          className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${!isGeoTiffOutput ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-white/10' : 'bg-transparent border border-slate-600 hover:border-slate-500 hover:bg-white/10 text-zinc-300'}`}
                        >
                          <Camera size={14} /> PNG
                        </button>
                      </div>
                    )
                  })()}
                
                <button 
                  onClick={resetWorkspace}
                  className="w-full bg-white/10 hover:bg-white/20 hover:bg-white/10 text-zinc-400 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-1"
                >
                  <RotateCcw size={16} /> Reset Workspace
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}



export default function App() {
  const [currentView, setCurrentView] = React.useState('home'); // home, selection, studio
  const [selectedTab, setSelectedTab] = React.useState('map');

  if (currentView === 'studio') {
    return <SRMStudio initialTab={selectedTab} onBack={() => setCurrentView('selection')} onHome={() => setCurrentView('home')} />;
  }

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center   relative overflow-hidden">
      
      
      {currentView === 'home' && (
        <>
          {/* Giant Dark Planet */}
          <div className="absolute -top-[20%] -right-[10%] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-zinc-800 to-black opacity-30 pointer-events-none blur-[1px] border border-white/5"></div>
          
          {/* Distant Moon */}
          <div className="absolute bottom-[10%] left-[5%] w-32 h-32 rounded-full bg-gradient-to-tl from-zinc-700 to-black opacity-40 pointer-events-none border border-white/10"></div>
          
          {/* Deep Space Dust / Ring effect */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[20%] bg-white/5 rounded-[100%] blur-3xl transform -rotate-12 pointer-events-none opacity-20"></div>
        </>
      )}

      {currentView === 'home' && (
        <div className="z-10 text-center animate-in fade-in zoom-in duration-500">
          <h1 className="text-6xl md:text-8xl font-light tracking-[0.2em] mb-4 text-white uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            AtmoPixel
          </h1>
          <p className="text-xl text-zinc-400 font-light mb-12 tracking-widest uppercase">
            See the world without limits
          </p>
          <button 
            onClick={() => setCurrentView('selection')}
            className="px-8 py-3 bg-white hover:bg-zinc-200 rounded-full text-black font-semibold text-lg transition-all  hover: hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
          >
            Let's Start <Activity size={20} />
          </button>
        </div>
      )}

      {currentView === 'selection' && (
        <div className="z-10 w-full max-w-4xl px-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
          <button onClick={() => setCurrentView('home')} className="mb-8 text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
             <ChevronDown className="rotate-90" size={16} /> Back
          </button>
          
          <h2 className="text-4xl font-bold mb-10 text-center">Choose your workflow</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Live Map Card */}
            <div 
              onClick={() => { setSelectedTab('map'); setCurrentView('studio'); }}
              className="bg-white/[0.03] backdrop-blur-xl backdrop-blur-sm border border-white/10 hover:border-white/30 rounded-2xl p-10 cursor-pointer transition-all hover:scale-105 hover: group"
            >
              <div className="bg-white/10 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MapIcon className="text-zinc-200" size={32} />
              </div>
              <h3 className="text-2xl font-bold mb-3">Live Map</h3>
              <p className="text-zinc-500 leading-relaxed">
                Interactively scan the globe and stream real-time Sentinel-2 satellite imagery. The AI will upscale your selected region on the fly.
              </p>
            </div>

            {/* Upload Card */}
            <div 
              onClick={() => { setSelectedTab('upload'); setCurrentView('studio'); }}
              className="bg-white/[0.03] backdrop-blur-xl backdrop-blur-sm border border-white/10 hover:border-white/30 rounded-2xl p-10 cursor-pointer transition-all hover:scale-105 hover: group"
            >
              <div className="bg-zinc-300/20 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="text-zinc-300" size={32} />
              </div>
              <h3 className="text-2xl font-bold mb-3">Upload File</h3>
              <p className="text-zinc-500 leading-relaxed">
                Already have your own satellite imagery? Upload local GeoTIFF or PNG files to pass them through the super-resolution pipeline.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-[#020617]"></div>
    </div>
  );
}


