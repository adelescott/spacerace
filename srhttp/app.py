from flask import Flask, jsonify, request
from helpers import (make_random_name, make_context, make_address,
                     make_control_str)

import zmq

app = Flask(__name__)
app.config.from_object('settings')


# TODO: context and sockets are never closed. Need to determine the best place
# TODO: these should actually be initialized on a per-request basis. question
# is whether the context can be shared.
context = make_context()

lobby_sock = context.socket(zmq.REQ)
lobby_sock.connect(make_address(app.config.get('SPACERACE_SERVER'),
                                app.config.get('SPACERACE_LOBBY_PORT')))

control_sock = context.socket(zmq.PUSH)
control_sock.connect(make_address(app.config.get('SPACERACE_SERVER'),
                                  app.config.get('SPACERACE_CONTROL_PORT')))


@app.route('/')
def hello_world():
    return jsonify(msg='Hello World!')


@app.route('/lobby')
def lobby():
    name = request.args.get('name', default=make_random_name())
    team = request.args.get('team', default=make_random_name())

    app.logger.debug('Registering "{}" under team "{}"'.format(name, team))
    lobby_sock.send_json(dict(name=name, team=team))

    app.logger.debug('Awaiting response from lobby...')
    # TODO: Need to set timeout for ZMQ socket here so the HTTP API server
    # doesn't just die if the socket is blocking
    response = lobby_sock.recv_json()

    return jsonify(response)


# TODO: Currently is GET method. Should instead be PUT or maybe POST.
@app.route('/control')
@app.route('/control/<string:secret>')
def control(secret=None):

    if secret is None:
        secret = request.args.get('secret')

    linear = request.args.get('linear')
    rotation = request.args.get('rotation')

    control_str = make_control_str(secret, linear, rotation)

    app.logger.debug('Sending control message "{0}"'.format(control_str))
    control_sock.send_string(control_str)

    # Response message and HTTP_202_ACCEPTED code
    # TODO: May need to send empty response to avoid confusion
    return 'Sent control message "{0}"'.format(control_str), 202

if __name__ == '__main__':
    app.run(debug=True)
