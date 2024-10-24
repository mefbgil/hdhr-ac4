FROM linuxserver/ffmpeg

RUN apt update -y
RUN apt upgrade -y

RUN DEBIAN_FRONTEND="noninteractive" TZ="America/New_York" apt install -yq --no-install-recommends sudo cron net-tools nano git vainfo ca-certificates expat libgomp1 libfontconfig gnupg

EXPOSE 80
EXPOSE 5004

ENV NODE_MAJOR=20

RUN sudo mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
RUN sudo apt update && sudo apt install nodejs -y

RUN mkdir /git && cd /git && git clone https://github.com/mefbgil/hdhr-ac4.git

RUN cd /git/hdhr-ac4 && \
    npm cache clean --force && \
    rm -rf node_modules package-lock.json && \
    npm install

CMD ["/bin/bash"]
