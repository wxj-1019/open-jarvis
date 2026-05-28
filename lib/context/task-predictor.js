import { PatternMiner } from "./pattern-miner.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("task-predictor");

export class TaskPredictor {
  constructor() {
    this._miner = new PatternMiner();
    this._model = null;
  }

  train(events) {
    this._model = this._miner.buildMarkovModel(events);
    log.log("model trained: " + this._model.states.length + " states");
  }

  predict(currentEvent) {
    if (!this._model) return null;

    const currentState = this._miner.encodeState(currentEvent);
    const prediction = this._miner.predictNext(this._model, currentState);

    if (!prediction) return null;

    return {
      ...prediction,
      interpretation: this._interpretState(prediction.state),
    };
  }

  predictSequence(currentEvent, steps = 3) {
    const result = [];
    let current = this._miner.encodeState(currentEvent);

    for (let i = 0; i < steps; i++) {
      const next = this._miner.predictNext(this._model, current);
      if (!next) break;

      result.push({
        step: i + 1,
        ...next,
        interpretation: this._interpretState(next.state),
      });

      current = next.state;
    }

    return result;
  }

  _interpretState(state) {
    const [category, timeBucket, dayOfWeek] = state.split("|");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return {
      category,
      timeBucket,
      dayOfWeek: days[parseInt(dayOfWeek)] ?? "Unknown",
      description: `${category} during ${timeBucket} on ${days[parseInt(dayOfWeek)]}`,
    };
  }

  getModelStats() {
    if (!this._model) return null;

    const transitionCount = Object.values(this._model.transitions).reduce(
      (sum, t) => sum + Object.keys(t).length,
      0
    );

    return {
      stateCount: this._model.states.length,
      transitionCount,
      avgTransitionsPerState: this._model.states.length > 0
        ? transitionCount / this._model.states.length
        : 0,
    };
  }
}
