import React, { useState, useEffect } from 'react';
import { 
  Satellite, Layers, Settings, User, Image as ImageIcon, Camera,
  UploadCloud, Download, RotateCcw, Activity, Map as MapIcon, ChevronDown, Loader2
} from 'lucide-react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { upscaleImage, extractLiveTile } from './api';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [modelArch, setModelArch] = useState('esrgan');
  
  // Map State
  const [viewportCenter, setViewportCenter] = useState([28.6139, 77.2090]); // New Delhi default
  const [mapBounds, setMapBounds] = useState(null); // [min_lon, min_lat, max_lon, max_lat]
  
  // Upload State
  const [file, setFile] = useState(null);
  const [originalPreview, setOriginalPreview] = useState(null);
  
  // Execution State
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [sliderPos, setSliderPos] = useState(50);
  const [error, setError] = useState(null);

  const handleFileUpload = (e) => {
    const selected = e.target.files[0];
    if (selected) {
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
        setLoadingStage('Running SR Inference...');
        data = await upscaleImage(file);
      } else if (activeTab === 'map') {
        if (!mapBounds) throw new Error("Map bounds not initialized.");
        setLoadingStage('Downloading cloud-free STAC imagery from AWS...');
        
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

  const handleDownloadGeoTIFF = async (e) => {
    e.preventDefault();
    if (!result || !result.download_url) return;
    try {
      const response = await fetch(`http://localhost:8000${result.download_url}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'geoenhance_hr.tif';
      if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
        filename = contentDisposition.split('filename=')[1].replace(/["']/g, '');
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Failed to download the GeoTIFF.");
    }
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
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* Left Navigation Bar */}
      <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 justify-between z-20">
        <div className="flex flex-col gap-6">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg cursor-pointer">
            <Satellite size={24} />
          </div>
          <div className="p-2 text-slate-400 hover:text-white cursor-pointer transition-colors">
            <Layers size={24} />
          </div>
          <div className="p-2 text-slate-400 hover:text-white cursor-pointer transition-colors">
            <Settings size={24} />
          </div>
        </div>
        <div className="p-2 text-slate-400 hover:text-white cursor-pointer transition-colors group relative">
          <User size={24} />
          <span className="absolute left-12 top-1 bg-slate-800 text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
            Elakiyan K.
          </span>
        </div>
      </div>

      {/* Left Control Drawer */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col z-20 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-wide text-white">GeoEnhance AI</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">NTRO SRM Problem ID: 26142</p>
        </div>

        <div className="flex border-b border-slate-800">
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'map' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30 transition-colors'}`}
            onClick={() => { setActiveTab('map'); resetWorkspace(); }}
          >
            <MapIcon size={16} /> Live Map
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'upload' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30 transition-colors'}`}
            onClick={() => { setActiveTab('upload'); resetWorkspace(); }}
          >
            <UploadCloud size={16} /> Upload
          </button>
        </div>

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
          {activeTab === 'map' && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-2">Live Bounding Box</h3>
              {mapBounds ? (
                <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded">
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
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                Position the viewport over the desired region. The AI will extract the exact bounding box from the Sentinel-2 STAC catalog and apply high-fidelity super resolution.
              </p>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="bg-slate-800/50 border border-slate-700 border-dashed rounded-lg p-6 flex flex-col items-center text-center">
              <ImageIcon size={32} className="text-slate-500 mb-2" />
              <p className="text-sm text-slate-300 font-medium">Drag & Drop GeoTIFF</p>
              <p className="text-xs text-slate-500 mt-1">Accepts .tif, .tiff, .png</p>
              <label className="mt-4 bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 px-4 rounded cursor-pointer transition-colors">
                Browse Files
                <input type="file" className="hidden" accept=".tif,.tiff,.png" onChange={handleFileUpload} />
              </label>
              {file && <p className="text-xs text-blue-400 mt-3 font-mono break-all">{file.name}</p>}
            </div>
          )}

          <div className="flex flex-col gap-4 mt-auto border-t border-slate-800 pt-6">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Model Architecture</label>
              <div className="relative">
                <select 
                  value={modelArch}
                  onChange={(e) => setModelArch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-md p-2.5 appearance-none focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="esrgan">ESRGAN (RRDBNet)</option>
                  <option value="swinir">SwinIR (Transformer)</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
              </div>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Upscale Factor</label>
              <div className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-md p-2.5 flex justify-between">
                <span>Super Resolution</span>
                <span className="text-blue-400 font-bold">4x</span>
              </div>
            </div>

            {error && <div className="text-xs text-red-400 bg-red-950/30 p-3 rounded border border-red-900/50 break-words">{error}</div>}

            <button 
              onClick={executePipeline}
              disabled={isProcessing || (activeTab === 'upload' && !file) || result}
              className={`w-full py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                isProcessing || result ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]'
              }`}
            >
              {isProcessing ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : result ? (
                'Enhancement Complete'
              ) : (
                'Execute SRM Pipeline'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 relative bg-slate-950 overflow-hidden flex items-center justify-center">
        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
            <h2 className="text-xl font-semibold text-white tracking-wide">{loadingStage}</h2>
            <p className="text-slate-400 text-sm mt-2">This process may take a few moments...</p>
          </div>
        )}

        {!result ? (
          // Pre-execution View
          <div className="absolute inset-0 z-0">
            {activeTab === 'map' ? (
              <>
                <MapContainer center={viewportCenter} zoom={15} className="w-full h-full" zoomControl={false}>
                  <TileLayer 
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    attribution="Tiles &copy; Esri"
                  />
                  <MapCenterTracker setCenter={setViewportCenter} setBounds={setMapBounds} />
                </MapContainer>
                
                {/* Visual indicator that the entire visible map viewport is the ROI */}
                <div className="absolute inset-8 border-2 border-blue-500/50 z-10 pointer-events-none bg-blue-500/5 backdrop-blur-[0.5px]">
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 -mt-[3px] -ml-[3px]" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 -mt-[3px] -mr-[3px]" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 -mb-[3px] -ml-[3px]" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 -mb-[3px] -mr-[3px]" />
                  
                  {/* Center Reticle */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-50">
                     <div className="w-8 h-8 border border-blue-400 rounded-full"></div>
                     <div className="w-1 h-1 bg-blue-400 rounded-full absolute"></div>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center p-12 bg-slate-900/50 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
                {originalPreview ? (
                  <div className="relative max-w-2xl w-full aspect-video">
                     <img src={originalPreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-lg border border-slate-700 shadow-2xl bg-slate-900" />
                  </div>
                ) : (
                  <div className="text-slate-600 flex flex-col items-center">
                    <ImageIcon size={64} className="mb-4 opacity-50" />
                    <p className="text-lg">Select a file from the control panel</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Post-execution Split Screen
          <div className="absolute inset-0 z-0 flex items-center justify-center p-12 bg-slate-900 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
            <div className="relative w-full max-w-5xl aspect-video rounded-xl overflow-hidden border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none">
              
              {/* Background (Enhanced) */}
              <img src={result.preview_base64} alt="Enhanced" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/10 shadow-lg z-10 pointer-events-none">
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
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/10 shadow-lg pointer-events-none">
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
                className="absolute top-0 bottom-0 w-1 bg-white/80 shadow-[0_0_15px_rgba(0,0,0,0.8)] z-10 pointer-events-none transform -translate-x-1/2"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-800">
                  <div className="flex gap-1">
                    <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                    <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                  </div>
                </div>
              </div>

            </div>

            {/* Floating Analysis Card */}
            <div className="absolute bottom-12 right-12 bg-slate-900/95 backdrop-blur-md border border-slate-700 p-6 rounded-xl shadow-2xl w-[340px] z-30">
              <h3 className="text-white font-bold mb-5 flex items-center gap-2"><Activity size={18} className="text-blue-400"/> Live Analysis Metrics</h3>
              
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Peak Signal-to-Noise Ratio (PSNR)</span>
                  <span className="text-blue-400 font-mono font-bold">{result.psnr.toFixed(2)} dB</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min((result.psnr / 40) * 100, 100)}%` }}></div>
                </div>
              </div>

              <div className="mb-7">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Structural Similarity (SSIM)</span>
                  <span className="text-emerald-400 font-mono font-bold">{result.ssim.toFixed(4)}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${result.ssim * 100}%` }}></div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={handleDownloadGeoTIFF}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20"
                  >
                    <Download size={14} /> GeoTIFF
                  </button>
                  <button 
                    onClick={handleDownloadImage}
                    className="flex-1 bg-transparent border border-slate-600 hover:border-slate-500 hover:bg-slate-800 text-slate-200 py-2.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Camera size={14} /> PNG
                  </button>
                </div>
                
                <button 
                  onClick={resetWorkspace}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-1"
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
