public class Piece
{
    public int Id { get; set; }
    public int PlayerId { get; set; }
    public int Position { get; set; } = -1; // -1 = at base, 0-39 = main path, 40-43 = home path
    public bool IsFinished { get; set; } = false;
}