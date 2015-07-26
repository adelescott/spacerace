#include "types.hpp"
#include "time.hpp"


void broadcastState(const StateMatrix& state, zmq::socket_t& socket)
{
  send(socket, {"Some fake state"});
  // LOG(INFO) << state;
  //convert the state into JSON
  //send that shit!
}

void initialiseState(StateMatrix& state)
{
  state = StateMatrix::Zero(state.rows(),state.cols());
}

void runGame(PlayerSet& players, ControlData& control, const Map& map,
    zmq::socket_t& stateSocket, const json& settings)
{
  
  uint integrationSteps = settings["integrationSteps"];
  float timeStep = settings["timeStep"];
  uint targetFPS = settings["targetFPS"];
  uint totalGameTimeSeconds = settings["gameTime"];
  float linearDrag = settings["physics"]["linearDrag"];
  float rotationalDrag = settings["physics"]["rotationalDrag"];
  float linearThrust = settings["physics"]["linearThrust"];
  float rotationalThrust = settings["physics"]["rotationalThrust"];

  uint nShips = players.ids.size();
  uint targetMicroseconds = 1000000 / targetFPS;
  StateMatrix state(nShips, STATE_LENGTH);
  initialiseState(state);
  ControlMatrix inputs = control.inputs;
  bool running = true;
  
  auto gameStart = hrclock::now();
  while (running && !interruptedBySignal)
  {
    LOG(INFO) << "Starting frame...";
    auto frameStart = hrclock::now();
    //get control inputs from control thread
    LOG(INFO) << "Broadcasting state";
    broadcastState(state, stateSocket);
    LOG(INFO) << "Collecting control inputs";
    {
      std::lock_guard<std::mutex> lock(control.mutex);
      inputs = control.inputs;
    }

    LOG(INFO) << "Integrating";
    for (uint i=0; i<integrationSteps;i++)
      eulerTimeStep(state, inputs, linearDrag, rotationalDrag, timeStep);
    
    //check we don't need to end the game
    running = !hasRoughIntervalPassed(gameStart, totalGameTimeSeconds, targetFPS);

    // make sure we target a particular frame rate
    waitPreciseInterval(frameStart, targetMicroseconds);
  }
  // Game over, so tell the clients
  send(stateSocket, {"GAME OVER", "some_json_stats?"});

}

