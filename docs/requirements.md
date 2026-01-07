# Product Requirements Document: Chess vs LLM

**Version**: 1.0  
**Last Updated**: January 2026  
**Status**: P0 (MVP)

---

## 1. Product Overview

### 1.1 Vision
A web-based chess application that enables users to play chess against Large Language Models (LLMs) through OpenRouter API, with transparent move reasoning and a polished user experience.

### 1.2 Goals
- Provide seamless human vs LLM chess gameplay
- Display LLM reasoning for each move
- Create an intuitive, chess.com-inspired interface
- Handle LLM errors gracefully with user control

### 1.3 Non-Goals (Out of Scope for P0)
- Backend server implementation
- User authentication/accounts
- Game history across sessions
- Multiplayer human vs human
- Tournament/rating systems
- Stockfish integration
- Move analysis/engine evaluation
- Undo/redo functionality
- Opening book suggestions

---

## 2. Technical Architecture

### 2.1 Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend Framework | React 18 + TypeScript | Type safety, component reusability |
| Routing | React Router | Simple 2-page navigation |
| Chess Logic | chess.js | Battle-tested move validation & game rules |
| Chess UI | react-chessboard | Visual board rendering & interaction |
| Styling | Tailwind CSS + Shadcn/ui | Rapid UI development, accessible components |
| Build Tool | Vite | Fast dev server, optimized builds |
| Package Manager | Bun | Fast installs, TypeScript native |
| LLM API | OpenRouter | Unified access to multiple LLM providers |
| Storage | localStorage | Client-side persistence, no backend needed |
| Deployment | Vercel/Netlify | Static hosting, free tier, CDN |

### 2.2 Architecture Decision Records

**Decision 1: Client-Side Only (No Backend)**
- **Rationale**: Users provide their own API keys, no server-side secrets needed
- **Trade-offs**: No rate limiting, no usage analytics
- **Future**: Add backend if need analytics/tournaments

**Decision 2: Direct OpenRouter API Calls (No AI SDK)**
- **Rationale**: Chess moves don't require streaming, simpler implementation
- **Trade-offs**: Manual error handling, no built-in retries
- **Benefits**: Smaller bundle size, full control

**Decision 3: localStorage for State**
- **Rationale**: Simple persistence for API keys and game state
- **Trade-offs**: Limited to single device, 5-10MB limit
- **Security**: User responsible for their API key

---

## 3. User Flows

### 3.1 First-Time User Flow

```
[Landing Page]
    ↓
[Enter API Key]
    ↓
[Test Connection] → [Error: Show message] → [Retry]
    ↓
[Select Model]
    ↓
[Start Game] → [Navigate to Game Page]
```

### 3.2 Returning User Flow

```
[Landing Page]
    ↓
[API Key Auto-loaded from localStorage]
    ↓
[Select Model (or use last selected)]
    ↓
[Start Game]
```

### 3.3 Gameplay Flow

```
[Human's Turn]
    ↓
[Click Piece] → [Show Valid Moves (dotted circles)]
    ↓
[Click Target Square] → [Play Move Sound]
    ↓
[Update Board & Move History]
    ↓
[LLM's Turn]
    ↓
[Show "Thinking..." UI]
    ↓
[API Call to OpenRouter]
    ↓
[Valid Move?]
    ├─ Yes → [Play Move Sound] → [Update Board] → [Human's Turn]
    └─ No → [Retry (up to 3 times)]
              ↓
              [All Retries Failed]
              ↓
              [Show Error Popup]
              ↓
              [User Choice: Forfeit or Random Move]
```

### 3.4 Game End Flow

```
[Checkmate / Stalemate / Draw Detected]
    ↓
[Play Game End Sound]
    ↓
[Show Result Popup]
    ↓
[User Options: New Game / Return to Setup]
```

---

## 4. Feature Requirements

### 4.1 Setup Page (Route: `/`)

#### 4.1.1 API Key Input
- **Component**: Text input with password masking toggle
- **Validation**: 
  - Required field
  - Minimum 20 characters
  - Show error if empty on submit
- **Storage**: Save to `localStorage` on successful connection test
- **Security Warning**: Display disclaimer: "Your API key is stored locally and never sent to our servers"

#### 4.1.2 Test Connection
- **Trigger**: Button click
- **Action**: Make test API call to OpenRouter `/models` endpoint
- **Success**: Show green checkmark + "Connection successful"
- **Failure**: Show error message with details
- **Loading**: Disable button, show spinner

#### 4.1.3 Model Selection
- **Component**: Searchable dropdown (Shadcn Select)
- **Data Source**: Fetch from `https://openrouter.ai/api/v1/models`
- **Display**: 
  - Model name
  - Provider (e.g., "Anthropic", "OpenAI")
  - Context window size
- **Default**: Pre-select `anthropic/claude-3.5-sonnet`
- **Storage**: Save selected model to `localStorage`

#### 4.1.4 Start Game Button
- **State**: Disabled until API key validated
- **Action**: Navigate to `/game` route
- **Visual**: Primary button, prominent styling

---

### 4.2 Game Page (Route: `/game`)

#### 4.2.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  [Logo/Title]              [New Game] [Offer Draw]  │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│                          │   Move History Panel     │
│    Chess Board           │   ┌──────────────────┐   │
│    (react-chessboard)    │   │ 1. e4      0.2s  │   │
│                          │   │ 1... e5    2.3s  │   │
│                          │   │    [v] View LLM  │   │
│                          │   │        thinking  │   │
│                          │   │ 2. Nf3     0.1s  │   │
│                          │   └──────────────────┘   │
│                          │                          │
│                          │   [Forfeit] [Draw]       │
└──────────────────────────┴──────────────────────────┘
```

**Responsive Breakpoint**:
- Desktop (≥1024px): Side-by-side layout
- Mobile (<1024px): Stack vertically (board on top, panel below)

---

#### 4.2.2 Chess Board Component

##### Visual Requirements
- **Size**: Responsive (max 600px on desktop, 100vw on mobile)
- **Orientation**: Human plays as White (bottom), LLM as Black (top)
- **Colors**: 
  - Light squares: `#f0d9b5`
  - Dark squares: `#b58863`
  - Selected piece: Yellow highlight
  - Last move: Light blue highlight on from/to squares
- **Coordinates**: Show file (a-h) and rank (1-8) labels

##### Interaction Requirements

**Piece Selection**:
- Click piece → Highlight piece with yellow border
- Show all valid moves with dotted circle overlay (like chess.com)
- Click empty space → Deselect piece

**Making a Move**:
- Click target square → Execute move
- Drag-and-drop also supported
- Invalid move attempt → Shake animation + error sound

**Valid Move Indicators**:
```typescript
// Use chess.js to get valid moves
const validMoves = game.moves({ square: 'e2', verbose: true })
// Show dotted circle on each target square
```

**Pawn Promotion**:
- Automatically promote to Queen (no UI picker for P0)
- Future: Add promotion piece selector

##### State Management
```typescript
interface BoardState {
  fen: string              // Current position
  selectedSquare: string | null
  validMoves: string[]     // For selected piece
  lastMove: { from: string, to: string } | null
  isLLMTurn: boolean
}
```

---

#### 4.2.3 Move History Panel

##### Layout
- Fixed height, scrollable
- Auto-scroll to latest move
- Alternating row colors for readability

##### Move Display Format
```
[Move Number]. [Move Notation]    [Time Taken]
```

**Example**:
```
1. e4          0.2s
1... e5        2.4s  [v]
2. Nf3         0.1s
2... Nc6       3.1s  [v]
```

##### Move Entry Components

**Human Moves**:
- Display move in SAN notation (e4, Nf3, O-O, etc.)
- Show time taken in seconds
- Highlight in white background

**LLM Moves**:
- Display move in SAN notation
- Show time taken (API latency)
- Highlight in light gray background
- Include chevron-down icon (collapsible)

##### LLM Reasoning Expansion

**Collapsed State**:
```
1... e5    2.4s  [ChevronDown]
```

**Expanded State**:
```
1... e5    2.4s  [ChevronUp]
┌─────────────────────────────────────┐
│ "I'm responding symmetrically to    │
│ control the center and open lines   │
│ for my pieces. This is a standard   │
│ King's Pawn opening."               │
└─────────────────────────────────────┘
```

**Implementation**:
- Use Shadcn `Collapsible` component
- Smooth animation (200ms)
- Persist expanded state for current session
- Show raw LLM response text

##### Action Buttons

**Offer Draw**:
- Position: Top right of panel
- Action: End game as draw immediately (no LLM acceptance needed for P0)
- Confirmation: "Are you sure you want to offer a draw?"

**Forfeit**:
- Position: Bottom of panel
- Action: End game, LLM wins
- Confirmation: "Are you sure you want to forfeit?"
- Style: Secondary/destructive button

**New Game**:
- Position: Top right (next to "Offer Draw")
- Action: Reset board, clear history, start fresh
- Confirmation: "Start a new game? Current game will be lost."

---

#### 4.2.4 LLM Turn Behavior

##### Thinking State UI

**Visual Indicator**:
```
┌─────────────────────────┐
│  🤔 LLM is thinking...  │
│  [animated dots]         │
└─────────────────────────┘
```

- Display over move history panel
- Animated ellipsis (...) 
- Semi-transparent overlay
- Disable board interaction

##### API Call Logic

**Prompt Structure**:
```typescript
const prompt = `You are playing chess as Black.

Current position (FEN): ${fen}

Legal moves: ${legalMoves.join(', ')}

Game history (PGN): ${pgn}

Respond in this exact format:
MOVE: e7e5
REASONING: [Your 1-2 sentence explanation]

Choose your move wisely.`
```

**API Request**:
```typescript
POST https://openrouter.ai/api/v1/chat/completions
{
  "model": "anthropic/claude-3.5-sonnet",
  "messages": [
    { "role": "system", "content": "You are a chess player." },
    { "role": "user", "content": prompt }
  ],
  "temperature": 0.7,
  "max_tokens": 200
}
```

**Response Parsing**:
```typescript
// Extract move and reasoning
const moveMatch = response.match(/MOVE:\s*([a-h][1-8][a-h][1-8][qrbn]?)/i)
const reasoningMatch = response.match(/REASONING:\s*(.+)/is)

const move = moveMatch?.[1]
const reasoning = reasoningMatch?.[1]?.trim()
```

##### Move Validation

**Validation Flow**:
```typescript
function validateLLMMove(moveString: string): boolean {
  try {
    // Try to parse move in various formats
    const move = game.move(moveString) || 
                 game.move({ from: moveString.slice(0,2), to: moveString.slice(2,4) })
    return !!move
  } catch {
    return false
  }
}
```

**Success Path**:
1. Parse LLM response
2. Validate move with chess.js
3. Execute move on board
4. Play move sound
5. Add to move history with reasoning
6. Switch to human's turn

**Failure Path (Invalid Move)**:

```
Attempt 1: Invalid
    ↓
Wait 1 second
    ↓
Attempt 2: Invalid (include previous error in prompt)
    ↓
Wait 2 seconds
    ↓
Attempt 3: Invalid
    ↓
Show Error Popup
```

**Retry Prompt Enhancement**:
```typescript
const retryPrompt = `Your previous move "${invalidMove}" was illegal.

Legal moves are: ${legalMoves.join(', ')}

Please choose a VALID move from this list.`
```

---

#### 4.2.5 Error Handling: Invalid Move Popup

##### Trigger Condition
- LLM generates invalid move 3 times consecutively

##### Popup UI

**Title**: "LLM Generated Invalid Move"

**Body**: 
```
The AI failed to generate a valid move after 3 attempts.

What would you like to do?
```

**Actions**:
- **Button 1**: "Play Random Move" (Primary)
  - Action: Generate random legal move via chess.js
  - Code: `const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)]`
  - Note: Add to move history with reasoning "Random move (AI error)"
  
- **Button 2**: "Forfeit & Reset" (Secondary)
  - Action: End game, show result modal, reset board
  - Note: Record as LLM forfeit

**Implementation**:
- Use Shadcn `AlertDialog`
- Cannot dismiss by clicking outside
- Must choose an action

---

#### 4.2.6 Game End Detection & Modal

##### Detection Logic

**Checkmate**:
```typescript
if (game.isCheckmate()) {
  const winner = game.turn() === 'w' ? 'Black (LLM)' : 'White (You)'
  showGameEndModal(winner, 'checkmate')
}
```

**Stalemate**:
```typescript
if (game.isStalemate()) {
  showGameEndModal('Draw', 'stalemate')
}
```

**Draw (Other)**:
```typescript
if (game.isDraw()) {
  const reason = game.isThreefoldRepetition() ? 'threefold repetition' :
                 game.isInsufficientMaterial() ? 'insufficient material' :
                 'fifty-move rule'
  showGameEndModal('Draw', reason)
}
```

##### Game End Modal

**Visual Design**:
```
┌────────────────────────────────┐
│   👑 / 🤝 / 🏁                 │
│                                │
│   Checkmate! White Wins        │
│   OR                           │
│   Stalemate - Draw             │
│                                │
│   [New Game]  [Back to Setup]  │
└────────────────────────────────┘
```

**Content**:
- Icon (👑 for win, 🤝 for draw, 🏁 for forfeit)
- Don't use emojies anywhere, instead use icons from lucide
- Result message
- Reason (checkmate/stalemate/draw/forfeit)
- Action buttons

**Actions**:
- **New Game**: Reset board, keep same model, stay on game page
- **Back to Setup**: Navigate to `/` to change model or API key

**Sound**:
- Play appropriate sound on display:
  - Win: Victory fanfare
  - Loss: Defeat sound
  - Draw: Neutral bell

---

#### 4.2.7 Sound Effects

##### Required Sounds

| Event | Sound | Duration | When Triggered |
|-------|-------|----------|----------------|
| Human Move | Move sound | ~200ms | After valid human move |
| LLM Move | Move sound | ~200ms | After LLM move executed |
| Invalid Move | Error buzz | ~300ms | Human attempts illegal move |
| Check | Alert chime | ~400ms | King in check |
| Checkmate | Victory fanfare | ~2s | Game ends in checkmate |
| Draw/Stalemate | Neutral bell | ~1s | Game ends in draw |

##### Implementation
```typescript
const sounds = {
  move: new Audio('/sounds/move.mp3'),
  invalid: new Audio('/sounds/invalid.mp3'),
  check: new Audio('/sounds/check.mp3'),
  checkmate: new Audio('/sounds/checkmate.mp3'),
  draw: new Audio('/sounds/draw.mp3')
}

function playSound(type: keyof typeof sounds) {
  sounds[type].currentTime = 0 // Reset if already playing
  sounds[type].play()
}
```

**Sound Files**:
- Use royalty-free chess sounds from freesound.org
- Format: MP3, 44.1kHz
- Volume: Normalize to -6dB

---

## 5. Data Models

### 5.1 localStorage Schema

#### 5.1.1 API Configuration
```typescript
// Key: 'chess-llm-api-key'
{
  apiKey: string        // OpenRouter API key
  lastValidated: number // Timestamp of last successful test
}

// Key: 'chess-llm-model'
{
  id: string           // e.g., "anthropic/claude-3.5-sonnet"
  name: string         // Display name
  provider: string     // e.g., "Anthropic"
  contextLength: number
}
```

#### 5.1.2 Game State
```typescript
// Key: 'chess-llm-game-state'
{
  fen: string                    // Current board position
  pgn: string                    // Full game in PGN format
  turn: 'white' | 'black'
  status: 'active' | 'ended'
  startedAt: number              // Timestamp
  lastMoveAt: number             // Timestamp
}
```

#### 5.1.3 Move History
```typescript
// Key: 'chess-llm-move-history'
{
  moves: MoveRecord[]
  model: string                  // Model used for this game
}

interface MoveRecord {
  moveNumber: number             // Full move number (1, 2, 3...)
  player: 'human' | 'llm'
  move: string                   // SAN notation: "e4", "Nf3"
  from: string                   // "e2"
  to: string                     // "e4"
  timestamp: number              // When move was made
  timeTakenMs: number            // Time to make move
  
  // LLM-specific fields
  llmReasoning?: string          // Extracted reasoning
  llmRawResponse?: string        // Full API response
  llmRetries?: number            // Number of retries (if any)
}
```

### 5.2 React State Management

- use zustand for state management

#### 5.2.1 Global State (Context)
```typescript
interface AppState {
  apiKey: string | null
  selectedModel: ModelInfo | null
  isConfigured: boolean
}
```

#### 5.2.2 Game State (Local)
```typescript
interface GameState {
  game: Chess                    // chess.js instance
  position: string               // FEN string
  moveHistory: MoveRecord[]
  selectedSquare: string | null
  validMoves: string[]
  lastMove: { from: string, to: string } | null
  isLLMTurn: boolean
  isThinking: boolean
  gameStatus: 'active' | 'checkmate' | 'stalemate' | 'draw' | 'forfeit'
}
```

---

## 6. API Integration

### 6.1 OpenRouter API

#### 6.1.1 Authentication
```typescript
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://yourdomain.com', // Required by OpenRouter
  'X-Title': 'Chess vs LLM'                   // Optional, for tracking
}
```

#### 6.1.2 Get Available Models
```typescript
GET https://openrouter.ai/api/v1/models

Response:
{
  data: [
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      context_length: 200000,
      pricing: {
        prompt: "0.000003",
        completion: "0.000015"
      }
    },
    // ... more models
  ]
}
```

**UI Display**:
- Filter to show only chat models (exclude embeddings)
- Sort by popularity or alphabetically
- Show pricing per 1M tokens

#### 6.1.3 Chat Completion
```typescript
POST https://openrouter.ai/api/v1/chat/completions

Request:
{
  "model": "anthropic/claude-3.5-sonnet",
  "messages": [
    {
      "role": "system",
      "content": "You are a chess player."
    },
    {
      "role": "user",
      "content": "Current position: ... Choose your move."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 200
}

Response:
{
  "id": "gen-123",
  "model": "anthropic/claude-3.5-sonnet",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "MOVE: e7e5\nREASONING: Controlling center"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 25,
    "total_tokens": 175
  }
}
```

### 6.2 Error Handling

#### 6.2.1 API Errors

| Error Code | Meaning | User Message | Action |
|-----------|---------|--------------|--------|
| 401 | Invalid API key | "Invalid API key. Please check and try again." | Redirect to setup |
| 429 | Rate limited | "Rate limit exceeded. Please wait and try again." | Show retry button |
| 500 | Server error | "OpenRouter is experiencing issues. Please try again." | Retry with backoff |
| Network | No connection | "Network error. Check your connection." | Show offline banner |

#### 6.2.2 Retry Strategy

**For API Calls**:
```typescript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response
      if (response.status === 429) {
        await delay(Math.pow(2, i) * 1000) // Exponential backoff
        continue
      }
      throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await delay(1000 * (i + 1))
    }
  }
}
```

---

## 7. UI/UX Specifications

### 7.1 Design System

#### 7.1.1 Colors
```css
/* Primary Palette */
--primary: #0ea5e9      /* Sky blue */
--primary-hover: #0284c7
--secondary: #64748b    /* Slate gray */
--destructive: #ef4444  /* Red */
--success: #22c55e      /* Green */

/* Chess Board */
--light-square: #f0d9b5
--dark-square: #b58863
--selected-square: #fef08a  /* Yellow */
--last-move: #bfdbfe        /* Light blue */
--valid-move-dot: rgba(0, 0, 0, 0.2)

/* Backgrounds */
--background: #ffffff
--panel-bg: #f8fafc
--border: #e2e8f0
```

#### 7.1.2 Typography
```css
/* Fonts */
--font-sans: 'Inter', system-ui, sans-serif
--font-mono: 'Fira Code', monospace

/* Sizes */
--text-xs: 0.75rem    /* 12px */
--text-sm: 0.875rem   /* 14px */
--text-base: 1rem     /* 16px */
--text-lg: 1.125rem   /* 18px */
--text-xl: 1.25rem    /* 20px */
--text-2xl: 1.5rem    /* 24px */
```

#### 7.1.3 Spacing
```css
--spacing-1: 0.25rem   /* 4px */
--spacing-2: 0.5rem    /* 8px */
--spacing-3: 0.75rem   /* 12px */
--spacing-4: 1rem      /* 16px */
--spacing-6: 1.5rem    /* 24px */
--spacing-8: 2rem      /* 32px */
```

### 7.2 Component Specifications

#### 7.2.1 Buttons

**Primary Button**:
```css
padding: 12px 24px
background: var(--primary)
color: white
border-radius: 6px
font-weight: 500
hover: brightness(110%)
active: scale(0.98)
```

**Secondary Button**:
```css
padding: 12px 24px
background: white
color: var(--secondary)
border: 1px solid var(--border)
border-radius: 6px
hover: background(--panel-bg)
```

**Destructive Button**:
```css
padding: 12px 24px
background: var(--destructive)
color: white
border-radius: 6px
hover: brightness(90%)
```

#### 7.2.2 Input Fields
```css
padding: 10px 14px
border: 1px solid var(--border)
border-radius: 6px
font-size: var(--text-base)
focus: border-color(--primary), ring(2px, --primary/20)
```

#### 7.2.3 Cards
```css
background: white
border: 1px solid var(--border)
border-radius: 8px
padding: 24px
box-shadow: 0 1px 3px rgba(0,0,0,0.1)
```

### 7.3 Responsive Design

#### 7.3.1 Breakpoints
```css
/* Mobile */
@media (max-width: 640px) {
  /* Stack layout vertically */
  /* Board: 100vw - 32px padding */
  /* Move panel: Full width below board */
}

/* Tablet */
@media (min-width: 641px) and (max-width: 1023px) {
  /* Still stacked, but larger */
  /* Board: Max 500px */
}

/* Desktop */
@media (min-width: 1024px) {
  /* Side-by-side layout */
  /* Board: Max 600px */
  /* Panel: Fixed 400px width */
}
```

### 7.4 Animations

#### 7.4.1 Move Animation
```css
/* Piece movement */
transition: transform 200ms ease-out

/* Valid move dots */
animation: pulse 2s infinite
@keyframes pulse {
  0%, 100% { opacity: 0.3 }
  50% { opacity: 0.6 }
}
```

#### 7.4.2 Thinking Indicator
```css
/* Animated ellipsis */
.thinking::after {
  content: '';
  animation: ellipsis 1.5s infinite;
}

@keyframes ellipsis {
  0% { content: ''; }
  33% { content: '.'; }
  66% { content: '..'; }
  100% { content: '...'; }
}
```

#### 7.4.3 Invalid Move Shake
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

.invalid-move {
  animation: shake 300ms ease-in-out;
}
```

---

## 8. Testing Requirements

### 8.1 Functional Testing Checklist

#### 8.1.1 Setup Page
- [ ] API key input accepts text
- [ ] Password toggle works (show/hide)
- [ ] Test connection succeeds with valid key
- [ ] Test connection fails with invalid key
- [ ] Error messages display correctly
- [ ] Model dropdown populates after successful test
- [ ] Model selection persists
- [ ] Start Game button navigates to /game
- [ ] localStorage saves API key and model

#### 8.1.2 Chess Board
- [ ] Board renders correctly
- [ ] Pieces are draggable
- [ ] Valid moves show dotted circles
- [ ] Invalid moves are rejected
- [ ] Move sound plays on valid move
- [ ] Last move is highlighted
- [ ] Castling works (both kingside and queenside)
- [ ] En passant works
- [ ] Pawn promotion (auto-queen) works

#### 8.1.3 LLM Integration
- [ ] LLM responds after human move
- [ ] Thinking indicator displays
- [ ] Valid LLM moves execute correctly
- [ ] Invalid LLM moves trigger retry
- [ ] After 3 failed attempts, error popup shows
- [ ] "Play Random Move" button works
- [ ] "Forfeit & Reset" button works
- [ ] LLM reasoning displays correctly

#### 8.1.4 Move History
- [ ] Moves appear in correct order
- [ ] Human and LLM moves are distinguishable
- [ ] Time taken displays correctly
- [ ] Chevron icon appears only for LLM moves
- [ ] Clicking chevron expands/collapses reasoning
- [ ] Panel auto-scrolls to latest move
- [ ] Scrollbar appears when needed

#### 8.1.5 Game End
- [ ] Checkmate detected correctly
- [ ] Stalemate detected correctly
- [ ] Draw by repetition detected
- [ ] Draw by insufficient material detected
- [ ] Game end modal displays
- [ ] Correct sound plays
- [ ] "New Game" resets board
- [ ] "Back to Setup" navigates to /

#### 8.1.6 Action Buttons
- [ ] "Offer Draw" ends game as draw
- [ ] "Forfeit" ends game, LLM wins
- [ ] "New Game" resets everything
- [ ] Confirmation dialogs appear
- [ ] Actions are cancellable

### 8.2 Edge Cases

#### 8.2.1 API Errors
- [ ] Network failure during LLM turn
- [ ] API rate limit exceeded
- [ ] API returns malformed response
- [ ] API times out (>30 seconds)
- [ ] API key becomes invalid mid-game

#### 8.2.2 Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

#### 8.2.3 Performance
- [ ] Game runs smoothly after 100+ moves
- [ ] localStorage doesn't exceed limits
- [ ] Memory doesn't leak over time
- [ ] Sounds don't overlap or glitch

---

## 9. Success Metrics

### 9.1 MVP Success Criteria

**Must Have (P0)**:
- ✅ User can complete a full game without errors
- ✅ LLM makes valid moves >90% of time on first attempt
- ✅ Average LLM response time <5 seconds
- ✅ All sounds play correctly
- ✅ UI is responsive on mobile and desktop
- ✅ No critical bugs blocking gameplay

**Nice to Have (P1)**:
- Board animations are smooth (60fps)
- Move history loads instantly
- Error messages are helpful and actionable
- UI feels polished and professional

### 9.2 User Experience Goals

**Efficiency**:
- Setup page completion: <2 minutes
- Average game duration: 10-30 minutes
- Time to retry after API error: <3 seconds

**Clarity**:
- User always knows whose turn it is
- LLM reasoning is easy to understand
- Error messages explain what went wrong

**Delight**:
- Sounds enhance experience (not annoying)
- Animations feel natural
- UI is visually appealing

---

## 10. Future Enhancements (Post-P0)

### 10.1 P1 Features (Next Version)

- **Undo Move**: Let user take back last move
- **Game History**: View past games from localStorage
- **Export PGN**: Download game as PGN file
- **Share Game**: Generate shareable link
- **Difficulty Levels**: Adjust LLM strategy (aggressive/defensive)
- **Opening Book**: Suggest common openings
- **Move Hints**: Show suggested moves for human
- **Dark Mode**: Toggle dark/light theme
- **Custom Piece Sets**: Choose different piece designs
- **Timer/Clock**: Add time controls (blitz, rapid, classical)

### 10.2 P2 Features (Future)

- **Play as Black**: Choose color preference
- **Stockfish Integration**: Engine analysis for moves
- **ELO Ratings**: Track player and model ratings
- **Tournament Mode**: Model vs model matches
- **Multi-game**: Play multiple games simultaneously
- **User Accounts**: Save games to cloud
- **Leaderboard**: Compare with other users
- **Puzzle Mode**: Tactical puzzles with LLM hints
- **Voice Commands**: Move pieces via voice
- **Replay Mode**: Animate past games

---

## 11. Technical Constraints

### 11.1 Browser Requirements
- **Minimum**: Modern browsers with ES2020 support
- **localStorage**: Required (min 5MB available)
- **JavaScript**: Must be enabled
- **Audio**: HTML5 Audio API support

### 11.2 API Constraints
- **OpenRouter Rate Limits**: Respect per-model limits
- **Token Limits**: Max 200 tokens per LLM response
- **Timeout**: 30 seconds max per API call
- **Cost**: User bears all API costs (their key)

### 11.3 Performance Targets
- **Bundle Size**: <500KB (gzipped)
- **First Contentful Paint**: <1.5s
- **Time to Interactive**: <3s
- **Lighthouse Score**: >90

---

## 12. Security Considerations

### 12.1 API Key Storage
- **Storage**: localStorage (client-side only)
- **Warning**: Display security disclaimer on setup page
- **Never Log**: Don't log or transmit API keys (except to OpenRouter)
- **Encryption**: Not implemented in P0 (user risk)

### 12.2 Input Validation
- **API Key**: Sanitize before storage
- **Model Selection**: Validate against fetched list
- **Move Input**: All moves validated by chess.js

### 12.3 XSS Prevention
- **LLM Responses**: Sanitize before rendering
- **User Input**: Escape all text inputs
- **React**: Use built-in XSS protection (JSX escaping)

---

## 13. Deployment

### 13.1 Build Configuration

```bash
# Install dependencies
bun install

# Development server
bun run dev

# Production build
bun run build
# Output: dist/

# Preview production build
bun run preview
```

### 13.2 Environment Variables

```env
# None required for P0 (all client-side)
# Future: Add analytics keys, etc.
```

### 13.3 Hosting Recommendations

**Primary**: Vercel
- ✅ Zero-config deployment
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Free tier sufficient

**Alternatives**:
- Netlify
- Cloudflare Pages
- GitHub Pages

### 13.4 Domain & URLs

**Routes**:
- `/` - Setup page
- `/game` - Game page
- 404 fallback to `/`

---


## 15. Acceptance Criteria

The MVP is considered complete when:

1. ✅ User can configure API key and select model
2. ✅ User can play a complete chess game against LLM
3. ✅ All piece moves work correctly (including special moves)
4. ✅ Valid move indicators (dotted circles) appear
5. ✅ Move sounds play on every move
6. ✅ LLM reasoning is visible for each LLM move
7. ✅ Invalid LLM moves trigger error popup with 2 actions
8. ✅ Game end (checkmate/stalemate/draw) is detected
9. ✅ Game end modal displays with correct sound
10. ✅ New Game and Forfeit buttons work
11. ✅ UI is responsive on mobile and desktop
12. ✅ No critical bugs or crashes
13. ✅ App can be deployed to production

---

## 16. Appendix

### 16.1 Chess Notation Reference

**SAN (Standard Algebraic Notation)**:
- `e4` - Pawn to e4
- `Nf3` - Knight to f3
- `O-O` - Kingside castle
- `O-O-O` - Queenside castle
- `Qxe5` - Queen captures on e5
- `e8=Q` - Pawn promotes to Queen

**UCI (Universal Chess Interface)**:
- `e2e4` - From e2 to e4
- `g1f3` - From g1 to f3
- `e1g1` - Kingside castle (king moves)
- `e7e8q` - Pawn promotion

### 16.2 FEN Notation

Example: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

- Board position (8 ranks, separated by /)
- Active color (w/b)
- Castling rights (KQkq)
- En passant target square
- Halfmove clock
- Fullmove number

### 16.3 PGN Format

```
[Event "Chess vs LLM"]
[Date "2026.01.07"]
[White "Human"]
[Black "Claude 3.5 Sonnet"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0
```
