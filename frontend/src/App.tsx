import { useState } from 'react';
import { DeckBattle } from './components/DeckBattle/DeckBattle';
import { MissionScreen } from './components/MissionScreen/MissionScreen';
import { TitleScreen } from './components/TitleScreen/TitleScreen';

type Screen = 'title' | 'mission' | 'deckbattle';

function App() {
  const [screen, setScreen] = useState<Screen>('title');

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
