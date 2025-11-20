using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

public class GameHub : Hub
{
    private static GameState _gameState = new GameState();

    public async Task RollDice()
    {
        if (_gameState.MustRoll && !_gameState.GameOver)
        {
            int diceValue = _gameState.RollDice();
            await Clients.All.SendAsync("DiceRolled", diceValue, _gameState.CurrentPlayerIndex);
            
            // Check if any pieces can be moved
            var currentPlayer = _gameState.GetCurrentPlayer();
            bool canMove = false;
            
            if (currentPlayer != null)
            {
                foreach (var piece in currentPlayer.Pieces)
                {
                    if (_gameState.CanMovePiece(currentPlayer.Id, piece.Id))
                    {
                        canMove = true;
                        break;
                    }
                }
            }
            
            if (!canMove && _gameState.DiceValue != 6)
            {
                // No moves available and not a 6, go to next player
                _gameState.CurrentPlayerIndex = (_gameState.CurrentPlayerIndex + 1) % _gameState.Players.Count;
                _gameState.MustRoll = true;
                await Clients.All.SendAsync("NextPlayer", _gameState.CurrentPlayerIndex);
            }
        }
    }

    public async Task MovePiece(int playerId, int pieceId)
    {
        if (_gameState.CanMovePiece(playerId, pieceId))
        {
            var player = _gameState.Players[playerId];
            var piece = player.Pieces[pieceId];
            int oldPosition = piece.Position;
            
            bool success = _gameState.MovePiece(playerId, pieceId);
            
            if (success)
            {
                await Clients.All.SendAsync("PieceMoved", playerId, pieceId, piece.Position, oldPosition);
                
                if (_gameState.GameOver)
                {
                    await Clients.All.SendAsync("GameOver", _gameState.WinnerPlayerId);
                }
                else if (_gameState.MustRoll)
                {
                    await Clients.All.SendAsync("NextPlayer", _gameState.CurrentPlayerIndex);
                }
            }
        }
    }

    public async Task GetGameState()
    {
        await Clients.Caller.SendAsync("GameStateUpdated", _gameState);
    }

    public async Task ResetGame()
    {
        _gameState = new GameState();
        await Clients.All.SendAsync("GameReset");
    }
}