# Use an official PyTorch runtime as a parent image
# This includes CUDA support out-of-the-box for GPU acceleration
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required for image processing libraries (like Rasterio/OpenCV)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install the Python dependencies
# We use --no-cache-dir to keep the Docker image size as small as possible
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend source code into the container
# (Excluding the frontend directory to keep the backend image focused)
COPY api/ api/
COPY core/ core/
COPY utils/ utils/
COPY main.py .

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose port 8000 for the FastAPI server
EXPOSE 8000

# Run the Uvicorn ASGI server when the container launches
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
