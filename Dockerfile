version: '3.8'

services:
  hdhr-ac4:
    image: hdhr:latest
    ports:
      - "80:80"
      - "5004:5004"
    environment:
      HDHR_IP: "10.0.0.151"
      HOST_IP: "10.0.0.20"
      DEVICEID_SWAP: "1"
      XDG_RUNTIME_DIR: "/tmp"
    volumes:
      - /data/mnt/docker/hdhr-ac4/config:/config
    devices:
      - /dev/dri:/dev/dri
    labels:
      - com.centurylinklabs.watchtower.monitor-only=true
    entrypoint: [""]  # Clear the existing ENTRYPOINT
    command: ["node", "index.js"]  # Run node index.js
    networks:
      mac_01:
        ipv4_address: 10.0.0.20
networks:
  mac_01:
    external: true
