import { useState } from 'react';
import { DeckBattle } from './components/DeckBattle/DeckBattle';
import { MissionScreen } from './components/MissionScreen/MissionScreen';
import { TitleScreen } from './components/TitleScreen/TitleScreen';
import { readRunCheckpoint } from './game/deckbattle/runCheckpoint';

type Screen = 'title' | 'mission' | 'deckbattle';

function App() {
  const [screen, setScreen] = useState<Screen>(() => readRunCheckpoint() ? 'deckbattle' : 'title');

  if (screen === 'title') {
    return <TitleScreen onStart={() => setScreen('mission')} />;
  }

  if (screen === 'mission') {
    return (
      <MissionScreen
        onSelectMission={() => setScreen('deckbattle')}
        onBack={() => setScreen('title')}
      />
    );
  }

  return <DeckBattle onBackToMissions={() => setScreen('mission')} />;
}

export default App;
