import 'dotenv/config';
import { SimulationState, UtilityAI } from '../biorhythm/utilityAI';

console.log('=== Utility AI Test: 48-hour Simulation ===\n');

// 平日48時間のシミュレーション
console.log('--- Weekday (平日) 48 hours ---');
let state: SimulationState = {
  hour: 0,
  isWeekend: false,
  energy: 80,
  currentAction: "",
};

for (let i = 0; i < 48; i++) {
  const action = UtilityAI.selectAction(state);
  console.log(
    `Day ${Math.floor(i / 24) + 1}, ${String(state.hour).padStart(2, '0')}:00 | ` +
    `Energy: ${state.energy.toFixed(0).padStart(3)} | ` +
    `Action: ${action}`
  );
  
  // 次の時間へ
  state.hour = (state.hour + 1) % 24;
}

console.log('\n--- Holiday (休日) 48 hours ---');
state = {
  hour: 0,
  isWeekend: true,
  energy: 80,
  currentAction: "",
};

for (let i = 0; i < 48; i++) {
  const action = UtilityAI.selectAction(state);
  console.log(
    `Day ${Math.floor(i / 24) + 1}, ${String(state.hour).padStart(2, '0')}:00 | ` +
    `Energy: ${state.energy.toFixed(0).padStart(3)} | ` +
    `Action: ${action}`
  );
  
  // 次の時間へ
  state.hour = (state.hour + 1) % 24;
}

console.log('\n=== Test Complete ===');
