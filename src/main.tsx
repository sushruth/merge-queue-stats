import { render } from 'preact';
import './styles.css';
import { App } from './App';
import { startApp } from './stores/bootstrap';

startApp();
render(<App />, document.getElementById('app')!);
