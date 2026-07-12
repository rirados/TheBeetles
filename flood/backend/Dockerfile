FROM python:3.11-slim

WORKDIR /app

# System deps for geopandas / osmnx / shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgdal-dev libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The bundled real OSM graph (app/data/mangalore_roads.graphml) is included
# and will be used as a fallback if the live download fails.

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
