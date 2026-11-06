import { useRoom } from './hooks/useRoom.js';
import JoinForm from './components/JoinForm.jsx';
import Room from './components/Room.jsx';

export default function App() {
  const room = useRoom();
  const inRoom = room.status === 'joined';

  return inRoom ? (
    <Room room={room} />
  ) : (
    <JoinForm onJoin={room.join} busy={room.status === 'joining'} error={room.error} />
  );
}
