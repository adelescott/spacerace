#pragma once
#include <algorithm>
#include "numpy.hpp"
#include <cstring>


Eigen::MatrixXf loadFloatFromNumpy(const std::string& filename)
{
  std::vector<int> shape;
  std::vector<float> data;
  aoba::LoadArrayFromNumpy(filename, shape, data);
  Eigen::MatrixXf mat(shape[1], shape[0]);
  std::size_t size = sizeof(float) * shape[0] * shape[1];
  memcpy(mat.data(), data.data(), size);
  mat.transposeInPlace();
  return mat;
}


Eigen::MatrixXb loadBoolFromNumpy(const std::string& filename)
{
  std::vector<int> shape;
  std::vector<char> data;
  aoba::LoadArrayFromNumpy<char>(filename, shape, data);
  Eigen::MatrixXb mat(shape[1], shape[0]);
  std::size_t size = sizeof(char) * shape[0] * shape[1];
  memcpy(mat.data(), data.data(), size);
  mat.transposeInPlace();
  return mat;
}


void loadMaps(json& settings, MapData& mapData)
{  
  std::vector<std::string> mapNames;
  for (std::string mapName : settings["maps"])
  {
    LOG(INFO) << "Attempting to load " << mapName;
    std::string path = settings["mapPath"];
    std::string prefix = path + "/" + mapName;
    Map m;
    m.name = mapName;
    m.occupancy = loadBoolFromNumpy(prefix + "_occupancy.npy");
    m.flowx = loadFloatFromNumpy(prefix + "_flowx.npy"); 
    m.flowy = loadFloatFromNumpy(prefix + "_flowy.npy");
    m.endDistance = loadFloatFromNumpy(prefix + "_enddist.npy");
    m.wallDistance = loadFloatFromNumpy(prefix + "_walldist.npy"); 
    m.maxDistance = m.endDistance.maxCoeff();
    m.wallNormalx = loadFloatFromNumpy(prefix + "_wnormx.npy");
    m.wallNormaly = loadFloatFromNumpy(prefix + "_wnormy.npy");
    float mapScale = settings["simulation"]["world"]["mapScale"];
    m.wallDistance = m.wallDistance / mapScale;
    Eigen::MatrixXb start = loadBoolFromNumpy(prefix + "_start.npy");
    Eigen::MatrixXb finish = loadBoolFromNumpy(prefix + "_end.npy"); 

    assert(start.rows() == finish.rows());
    assert(start.cols() == finish.cols());

    for (uint r=0;r<start.rows();r++)
      for (uint c=0;c<start.cols();c++)
      {
        if (start(r,c))
          m.start.insert(std::make_pair(r,c));
        else if(finish(r,c))
          m.finish.insert(std::make_pair(r,c));
      }
    mapNames.push_back(mapName);
    mapData.maps.push_back(std::move(m));
  }
  settings["maps"] = mapNames;
}

// position to index with bounds clamping
std::pair<uint,uint> indices(float x, float y, const Map& map,
        const SimulationParameters& params)
{
  int iy = int(y * params.mapScale);
  iy = std::max(0, std::min(iy, int(map.occupancy.rows()-1)));
  int ix = int(x * params.mapScale);
  ix = std::max(0, std::min(ix, int(map.occupancy.cols()-1)));
  return std::make_pair(uint(iy), uint(ix));
}
