# Network Traffic Sample Files

These JSON files contain sample network traffic metrics for testing the Sentinel Prime security analysis system.

## File Format
Each file contains an array of 10 numeric values representing different network traffic metrics:

1. `sbytes` - Source bytes
2. `rate` - Packets per second
3. `sttl` - Source time to live
4. `dttl` - Destination time to live
5. `sload` - Source bits per second
6. `dload` - Destination bits per second
7. `smean` - Mean packet size
8. `ct_state_ttl` - Connection state time to live
9. `ct_dst_src_ltm` - Connection destination to source lifetime
10. `ct_srv_dst` - Connection service destination

## Sample Files

### clean-traffic.json
Normal network traffic pattern with typical values for a benign connection.

### dos-attack.json
Traffic pattern indicating a potential Denial of Service (DoS) attack:
- High packet rate
- Large source bytes
- Increased connection counts

### probe-attack.json
Traffic pattern indicating a potential probe/scan attack:
- Symmetric traffic pattern
- Multiple connections
- Equal source and destination loads

## Usage
1. Download the desired sample file
2. Upload it to the Sentinel Prime analysis tool
3. Observe the detection results

Note: These are example files for testing purposes only. Real network traffic patterns may vary. 