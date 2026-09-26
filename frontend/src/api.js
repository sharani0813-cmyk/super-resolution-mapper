const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const upscaleImage = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/upscale`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Error upscaling image');
  }

  return response.json();
};

export const extractLiveTile = async (bbox) => {
  const response = await fetch(`${API_URL}/api/extract-live-tile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bbox })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Error extracting live STAC tile');
  }

  return response.json();
};
