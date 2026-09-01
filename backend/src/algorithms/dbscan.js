export class DBSCAN {
  constructor(points, epsilon, minPoints) {
    this.points = points;
    this.epsilon = epsilon;
    this.minPoints = minPoints;
    this.visited = new Set();
    this.clusters = [];
    this.noise = [];
  }

  run() {
    for (const point of this.points) {
      if (this.visited.has(point.id)) continue;
      
      this.visited.add(point.id);
      const neighbors = this.getNeighbors(point);
      
      if (neighbors.length < this.minPoints) {
        this.noise.push(point);
      } else {
        const cluster = [];
        this.expandCluster(point, neighbors, cluster);
        this.clusters.push(cluster);
      }
    }
    
    return {
      clusters: this.clusters,
      noise: this.noise,
      clusterCount: this.clusters.length,
      noiseCount: this.noise.length
    };
  }

  getNeighbors(point) {
    return this.points.filter(p => {
      if (p.id === point.id) return false;
      return this.distance(point, p) <= this.epsilon;
    });
  }

  distance(p1, p2) {
    const [lon1, lat1] = p1.coordinates;
    const [lon2, lat2] = p2.coordinates;
    
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return (R * c) / 111.32;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  expandCluster(point, neighbors, cluster) {
    cluster.push(point);
    
    for (const neighbor of neighbors) {
      if (!this.visited.has(neighbor.id)) {
        this.visited.add(neighbor.id);
        const neighborNeighbors = this.getNeighbors(neighbor);
        
        if (neighborNeighbors.length >= this.minPoints) {
          neighbors.push(...neighborNeighbors.filter(n => 
            !neighbors.some(nn => nn.id === n.id)
          ));
        }
      }
      
      if (!cluster.some(c => c.id === neighbor.id)) {
        cluster.push(neighbor);
      }
    }
  }
}
