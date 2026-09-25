# Single-process embedded application

The application will ship as one static Go binary containing the React SPA, with room state held in memory and exactly one running replica. This sacrifices restart durability, independent frontend deployment, and horizontal scaling in exchange for one deployment artifact and minimal operations; persistence or distributed room coordination should be added only when those limits become real constraints.
