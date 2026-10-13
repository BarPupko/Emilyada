import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HostController from './components/HostController'
import HostGate from './components/HostGate'
import QuestionEditor from './components/QuestionEditor'
import PlayerScreen from './components/PlayerScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/host"
          element={
            <HostGate>
              <HostController />
            </HostGate>
          }
        />
        <Route
          path="/host/edit"
          element={
            <HostGate>
              <QuestionEditor />
            </HostGate>
          }
        />
        <Route path="*" element={<PlayerScreen />} />
      </Routes>
    </BrowserRouter>
  )
}
