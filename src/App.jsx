import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CreateGame from './components/CreateGame'
import Home from './components/Home'
import HostController from './components/HostController'
import HostGate from './components/HostGate'
import PlayerScreen from './components/PlayerScreen'
import QuestionEditor from './components/QuestionEditor'
import { DEFAULT_CODE } from './lib/game'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/play/:code" element={<PlayerScreen />} />
        <Route
          path="/host/:code"
          element={
            <HostGate>
              <HostController />
            </HostGate>
          }
        />
        <Route
          path="/host/:code/edit"
          element={
            <HostGate>
              <QuestionEditor />
            </HostGate>
          }
        />
        {/* old links */}
        <Route path="/host" element={<Navigate to={`/host/${DEFAULT_CODE}`} replace />} />
        <Route path="/host/edit" element={<Navigate to={`/host/${DEFAULT_CODE}/edit`} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
