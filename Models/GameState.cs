public class GameState
{
    public List<Piece> RedPieces { get; set; } = new();
    public List<Piece> BluePieces { get; set; } = new();

    public int DiceRoll()
    {
        Random rnd = new Random();
        return rnd.Next(1, 7);
    }

    public void MovePiece(List<Piece> pieces, int pieceId, int dice)
    {
        var piece = pieces.First(p => p.Id == pieceId);

        if (piece.IsFinished) return;

        piece.Position += dice;

        if (piece.Position >= 56)
        {
            piece.Position = 56;
            piece.IsFinished = true;
        }
    }
}
