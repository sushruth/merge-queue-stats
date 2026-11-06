import { render } from 'preact';
import './styles.css';
import { App } from './App';
import { useAuth } from './stores/auth';
import { startApp } from './stores/bootstrap';

startApp();
void useAuth.getState().checkLogin();
render(<App />, document.getElementById('app')!);
