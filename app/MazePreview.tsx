"use client";
import { useState, type CSSProperties } from "react";
import type { Maze } from "./lab-types";

export default function MazePreview({ maze, requireCheckpoint = false }: {maze: Maze; requireCheckpoint?:boolean}) {
  const [position, setPosition] = useState(maze.start);
  const [moves, setMoves] = useState(0);
  const [checkpointVisited,setCheckpointVisited] = useState(false);
  const won = position[0] === maze.goal[0] && position[1] === maze.goal[1] && (!requireCheckpoint || checkpointVisited);
  function move(dx: number, dy: number) {
    if (won) return;
    const next: [number,number] = [position[0]+dx, position[1]+dy];
    const tile = maze.grid[next[1]]?.[next[0]];
    if (tile === ".") { setPosition(next); setMoves(moves+1); if(next[0]===3&&next[1]===3)setCheckpointVisited(true); }
  }
  return <section className="lab-maze-panel" aria-label="Playable maze preview">
    <div className="lab-panel-heading"><div><span className="lab-label">Playable artifact</span><h2>{maze.title || "Maze workspace"}</h2></div><span>{moves} moves</span></div>
    <div className="lab-maze" style={{"--cols": maze.grid[0]?.length || 1} as CSSProperties} aria-label="Maze board">
      {maze.grid.flatMap((row,y) => [...row].map((tile,x) => <span key={`${x}-${y}`} className={tile === "#" ? "wall" : "floor"} aria-label={x === position[0] && y === position[1] ? "Player" : x === maze.goal[0] && y === maze.goal[1] ? "Exit" : tile === "#" ? "Wall" : "Path"}>{x === position[0] && y === position[1] ? "●" : x === maze.goal[0] && y === maze.goal[1] ? "◇" : ""}</span>))}
    </div>
    {requireCheckpoint && <p>Visit checkpoint [3,3] before finishing. {checkpointVisited ? "Checkpoint visited." : "Checkpoint not visited yet."}</p>}
    <div className="lab-maze-controls"><button aria-label="Move left" onClick={()=>move(-1,0)}>←</button><button aria-label="Move up" onClick={()=>move(0,-1)}>↑</button><button aria-label="Move down" onClick={()=>move(0,1)}>↓</button><button aria-label="Move right" onClick={()=>move(1,0)}>→</button><button onClick={()=>{setPosition(maze.start);setMoves(0);setCheckpointVisited(false);}}>Restart preview</button></div>
    <p role="status">{won ? "Exit reached. Restart to play again." : "Use the controls to reach ◇. Preview play does not change the recorded experiment."}</p>
  </section>;
}
