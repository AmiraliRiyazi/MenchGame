using System;
using System.Collections.Generic;
using System.Linq;

public class GameState
{
    public List<Player> Players { get; set; } = new();
    public int CurrentPlayerIndex { get; set; } = 0;
    public int DiceValue { get; set; } = 0;
    public bool MustRoll { get; set; } = true;
    public bool GameOver { get; set; } = false;
    public int WinnerPlayerId { get; set; } = -1;
    private HashSet<(int playerId, int pieceId)> _movedPiecesInCurrentTurn = new();
    private int _consecutiveSixes = 0;

    public GameState()
    {
        // Initialize 4 players with 4 pieces each
        for (int i = 0; i < 4; i++)
        {
            var player = new Player
            {
                Id = i,
                Color = GetColorName(i)
            };

            // Create 4 pieces for each player
            for (int j = 0; j < 4; j++)
            {
                player.Pieces.Add(new Piece
                {
                    Id = j,
                    PlayerId = i,
                    Position = -1, // At base
                    IsFinished = false
                });
            }

            Players.Add(player);
        }
    }

    private string GetColorName(int playerId)
    {
        return playerId switch
        {
            0 => "red",
            1 => "blue",
            2 => "green",
            3 => "yellow",
            _ => "unknown"
        };
    }

    public int RollDice()
    {
        Random rnd = new Random();
        DiceValue = rnd.Next(1, 7);
        MustRoll = false;
        _movedPiecesInCurrentTurn.Clear(); // Clear moved pieces when rolling dice
        
        // Handle consecutive sixes rule
        if (DiceValue == 6)
        {
            _consecutiveSixes++;
            // If three consecutive sixes, send a piece back to base
            if (_consecutiveSixes == 3)
            {
                HandleThreeConsecutiveSixes();
                _consecutiveSixes = 0; // Reset counter
            }
        }
        else
        {
            _consecutiveSixes = 0; // Reset counter when not six
        }
        
        return DiceValue;
    }

    public bool CanMovePiece(int playerId, int pieceId)
    {
        if (GameOver) return false;
        if (playerId != CurrentPlayerIndex) return false;
        if (MustRoll) return false;
        // Check if piece has already been moved in this turn
        if (_movedPiecesInCurrentTurn.Contains((playerId, pieceId))) return false;

        var player = Players.FirstOrDefault(p => p.Id == playerId);
        if (player == null) return false;

        var piece = player.Pieces.FirstOrDefault(p => p.Id == pieceId);
        if (piece == null) return false;

        // If piece is at base, only can move if dice is 6
        if (piece.Position == -1)
        {
            return DiceValue == 6;
        }

        // Check if moving would go beyond the finish line
        int newPosition = piece.Position + DiceValue;
        if (newPosition > 43) // 40 main path + 4 home = 44 total (0-43)
        {
            return false;
        }

        return true;
    }

    public bool MovePiece(int playerId, int pieceId)
    {
        if (!CanMovePiece(playerId, pieceId)) return false;

        var player = Players.FirstOrDefault(p => p.Id == playerId);
        if (player == null) return false;

        var piece = player.Pieces.FirstOrDefault(p => p.Id == pieceId);
        if (piece == null) return false;

        // Mark this piece as moved in current turn
        _movedPiecesInCurrentTurn.Add((playerId, pieceId));

        int oldPosition = piece.Position;
        
        // If piece is at base and dice is 6, move it to start position
        if (piece.Position == -1 && DiceValue == 6)
        {
            piece.Position = GetStartPosition(playerId); // Move to player's start position
        }
        else if (piece.Position >= 0)
        {
            piece.Position += DiceValue;
        }

        // Check if piece would go beyond the finish line
        if (piece.Position > 43)
        {
            // Can't move, revert position
            piece.Position = oldPosition;
            return false;
        }

        // Check if piece reached the finish
        if (piece.Position == 43)
        {
            piece.IsFinished = true;

            // Check if player won (all pieces finished)
            if (player.Pieces.All(p => p.IsFinished))
            {
                GameOver = true;
                WinnerPlayerId = playerId;
            }
        }

        // Handle collisions (send opponent pieces back to base)
        bool collisionOccurred = false;
        if (piece.Position >= 0 && piece.Position < 40 && !IsSafePosition(piece.Position))
        {
            collisionOccurred = HandleCollisions(playerId, piece.Position);
        }

        // After moving a piece, clear the moved pieces tracking
        _movedPiecesInCurrentTurn.Clear();
        
        // If player rolled a 6, they get another turn (unless it was the third consecutive 6)
        if (DiceValue == 6 && _consecutiveSixes < 3)
        {
            MustRoll = true; // Player can roll again
        }
        else
        {
            // If player didn't roll a 6 or it was the third consecutive 6, go to next player
            CurrentPlayerIndex = (CurrentPlayerIndex + 1) % Players.Count;
            MustRoll = true;
        }

        return true;
    }

    private int GetStartPosition(int playerId)
    {
        // Return the start position for each player color
        return playerId switch
        {
            0 => 0,   // Red starts at position 0
            1 => 10,  // Blue starts at position 10
            2 => 20,  // Green starts at position 20
            3 => 30,  // Yellow starts at position 30
            _ => 0
        };
    }

    private bool IsSafePosition(int position)
    {
        // Safe positions are the start positions for each player
        return position == 0 || position == 10 || position == 20 || position == 30;
    }

    private bool HandleCollisions(int currentPlayerId, int position)
    {
        bool collisionOccurred = false;
        
        // Skip collision handling for safe positions
        if (IsSafePosition(position))
            return false;

        foreach (var player in Players)
        {
            // Skip current player
            if (player.Id == currentPlayerId) continue;

            foreach (var piece in player.Pieces)
            {
                // If opponent piece is at the same position and not finished, send it back to base
                if (piece.Position == position && !piece.IsFinished)
                {
                    piece.Position = -1; // Send back to base
                    collisionOccurred = true;
                }
            }
        }
        
        return collisionOccurred;
    }

    private void HandleThreeConsecutiveSixes()
    {
        var currentPlayer = Players[CurrentPlayerIndex];
        
        // Find a piece that is on the board (not at base and not finished)
        var pieceOnBoard = currentPlayer.Pieces.FirstOrDefault(p => p.Position >= 0 && !p.IsFinished);
        
        if (pieceOnBoard != null)
        {
            // Send the piece back to base
            pieceOnBoard.Position = -1;
        }
        // If no pieces are on the board, the rule is ignored (as per rules)
    }



    public Player? GetCurrentPlayer()
    {
        return Players.FirstOrDefault(p => p.Id == CurrentPlayerIndex);
    }
}