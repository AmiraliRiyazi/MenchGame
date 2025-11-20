using System.Collections.Generic;

public class Player
{
    public int Id { get; set; }
    public string Color { get; set; } = string.Empty;
    public List<Piece> Pieces { get; set; } = new List<Piece>();
}